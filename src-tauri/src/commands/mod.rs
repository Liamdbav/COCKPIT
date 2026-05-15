use std::sync::Mutex;

use chrono::Utc;
use futures_util::StreamExt;
use rusqlite::Connection;
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::models::{
    BuildEntry, BuildEntryPayload, ClientDetail, ClientListItem, CreateClientPayload,
    CreateProjectPayload, DashboardProject, LlmConfig, LlmConfigView, ProjectListItem,
    ProjectWithEntries, SocialConfig, UpdateClientPayload,
};

/// Projets en cours ou planifiés — alimente la vue principale du tableau de bord
#[tauri::command]
pub fn get_dashboard_projects(
    db: State<Mutex<Connection>>,
) -> Result<Vec<DashboardProject>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .prepare(
            "SELECT p.id, p.name, c.id, c.name, c.type, p.status, p.created_at
             FROM projects p
             JOIN clients c ON p.client_id = c.id
             WHERE p.status IN ('planned', 'active')
             ORDER BY p.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DashboardProject {
                id: row.get(0)?,
                name: row.get(1)?,
                client_id: row.get(2)?,
                client_name: row.get(3)?,
                client_type: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Liste de tous les clients avec un indicateur de projet actif
#[tauri::command]
pub fn get_all_clients(db: State<Mutex<Connection>>) -> Result<Vec<ClientListItem>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .prepare(
            "SELECT id, name, type, email,
             EXISTS(
               SELECT 1 FROM projects
               WHERE client_id = clients.id AND status = 'active'
             )
             FROM clients
             ORDER BY name ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ClientListItem {
                id: row.get(0)?,
                name: row.get(1)?,
                client_type: row.get(2)?,
                email: row.get(3)?,
                has_active_project: row.get::<_, bool>(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Fiche client complète : données du client + tous ses projets + toutes leurs entrées de build
#[tauri::command]
pub fn get_client_detail(id: String, db: State<Mutex<Connection>>) -> Result<ClientDetail, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    // On récupère d'abord les données du client
    let (cid, name, client_type, email, phone, address, notes, created_at) = db
        .query_row(
            "SELECT id, name, type, email, phone, address, notes, created_at
             FROM clients WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    // On collecte les projets dans un Vec avant d'itérer pour libérer le statement.
    // La liaison explicite `rows` garantit que stmt est droppé avant la fin du bloc,
    // ce qui évite le conflit de lifetime avec le temporaire du `?`.
    let projects_raw: Vec<(String, String, String, String, Option<String>)> = {
        let mut stmt = db
            .prepare(
                "SELECT id, name, status, created_at, delivered_at
                 FROM projects WHERE client_id = ?1
                 ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![cid], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };

    // Pour chaque projet, on charge ses entrées de build
    let mut projects = Vec::new();
    for (proj_id, proj_name, proj_status, proj_created_at, proj_delivered_at) in projects_raw {
        let entries: Vec<BuildEntry> = {
            let mut stmt = db
                .prepare(
                    "SELECT id, project_id, content, last_actions, next_challenges,
                     created_at, updated_at
                     FROM build_entries WHERE project_id = ?1
                     ORDER BY created_at DESC",
                )
                .map_err(|e| e.to_string())?;

            // Même raison que pour projects_raw : liaison explicite pour éviter le
            // conflit de lifetime entre stmt et le temporaire du `?`
            let rows = stmt
                .query_map(rusqlite::params![proj_id], |row| {
                    Ok(BuildEntry {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        content: row.get(2)?,
                        last_actions: row.get(3)?,
                        next_challenges: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            rows
        };

        projects.push(ProjectWithEntries {
            id: proj_id,
            name: proj_name,
            status: proj_status,
            created_at: proj_created_at,
            delivered_at: proj_delivered_at,
            entries,
        });
    }

    Ok(ClientDetail {
        id: cid,
        name,
        client_type,
        email,
        phone,
        address,
        notes,
        created_at,
        projects,
    })
}

/// Crée un client, retourne son ID généré
#[tauri::command]
pub fn create_client(
    payload: CreateClientPayload,
    db: State<Mutex<Connection>>,
) -> Result<String, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO clients (id, type, name, email, phone, address, notes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            id,
            payload.client_type,
            payload.name,
            payload.email,
            payload.phone,
            payload.address,
            payload.notes,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

/// Crée un projet rattaché à un client existant, retourne son ID généré
#[tauri::command]
pub fn create_project(
    payload: CreateProjectPayload,
    db: State<Mutex<Connection>>,
) -> Result<String, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO projects (id, client_id, name, status, created_at)
         VALUES (?1, ?2, ?3, 'planned', ?4)",
        rusqlite::params![id, payload.client_id, payload.name, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

/// Change le statut d'un projet ; si le statut est 'delivered', horodate la livraison
#[tauri::command]
pub fn update_project_status(
    id: String,
    status: String,
    db: State<Mutex<Connection>>,
) -> Result<(), String> {
    // On valide côté Rust pour ne pas dépendre uniquement du CHECK SQLite
    if !["planned", "active", "delivered"].contains(&status.as_str()) {
        return Err(format!("statut invalide : '{}'", status));
    }

    let db = db.lock().map_err(|e| e.to_string())?;

    if status == "delivered" {
        let now = Utc::now().to_rfc3339();
        db.execute(
            "UPDATE projects SET status = ?1, delivered_at = ?2 WHERE id = ?3",
            rusqlite::params![status, now, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "UPDATE projects SET status = ?1 WHERE id = ?2",
            rusqlite::params![status, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Ajoute une entrée de build à un projet, retourne son ID généré
#[tauri::command]
pub fn add_build_entry(
    payload: BuildEntryPayload,
    db: State<Mutex<Connection>>,
) -> Result<String, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO build_entries
         (id, project_id, content, last_actions, next_challenges, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![
            id,
            payload.project_id,
            payload.content,
            payload.last_actions,
            payload.next_challenges,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

/// Tous les projets (tous statuts) avec le nom du client et le count d'entrées de build
#[tauri::command]
pub fn get_all_projects(db: State<Mutex<Connection>>) -> Result<Vec<ProjectListItem>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .prepare(
            "SELECT p.id, p.name, p.status, p.created_at, p.delivered_at,
                    c.id, c.name,
                    COUNT(b.id) AS entry_count
             FROM projects p
             JOIN clients c ON p.client_id = c.id
             LEFT JOIN build_entries b ON b.project_id = p.id
             GROUP BY p.id
             ORDER BY p.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ProjectListItem {
                id: row.get(0)?,
                name: row.get(1)?,
                status: row.get(2)?,
                created_at: row.get(3)?,
                delivered_at: row.get(4)?,
                client_id: row.get(5)?,
                client_name: row.get(6)?,
                entry_count: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Met à jour les champs d'un client existant
#[tauri::command]
pub fn update_client(
    id: String,
    payload: UpdateClientPayload,
    db: State<Mutex<Connection>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE clients SET type=?1, name=?2, email=?3, phone=?4, address=?5, notes=?6 WHERE id=?7",
        rusqlite::params![
            payload.client_type,
            payload.name,
            payload.email,
            payload.phone,
            payload.address,
            payload.notes,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime un client — échoue si au moins un projet lui est encore rattaché
#[tauri::command]
pub fn delete_client(id: String, db: State<Mutex<Connection>>) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    // On refuse la suppression tant que des projets existent pour ce client ;
    // le CASCADE du schéma ne doit pas s'appliquer silencieusement ici
    let count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE client_id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if count > 0 {
        return Err(format!(
            "Ce client a {} projet(s) associé(s). Supprimez-les d'abord.",
            count
        ));
    }

    db.execute("DELETE FROM clients WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Supprime un projet et ses entrées de build (via ON DELETE CASCADE)
#[tauri::command]
pub fn delete_project(id: String, db: State<Mutex<Connection>>) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    db.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Teste la connexion au provider LLM configuré via une requête HTTP minimale.
/// Le verrou DB est libéré avant le spawn_blocking pour éviter tout deadlock.
#[tauri::command]
pub async fn test_llm_connection(db: State<'_, Mutex<Connection>>) -> Result<String, String> {
    let (provider, api_key, base_url, model) = {
        let guard = db.lock().map_err(|e| e.to_string())?;
        guard
            .query_row(
                "SELECT provider, api_key, base_url, model FROM llm_config WHERE id = 'default'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?
    };

    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        match provider.as_str() {
            "anthropic" => {
                let key = api_key.ok_or_else(|| "Clé API manquante".to_string())?;
                let body = serde_json::json!({
                    "model": model,
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": "ping"}]
                });
                let resp = client
                    .post("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", &key)
                    .header("anthropic-version", "2023-06-01")
                    .header("content-type", "application/json")
                    .json(&body)
                    .send()
                    .map_err(|e| e.to_string())?;
                let status = resp.status();
                if status.is_success() {
                    Ok("Connexion établie".to_string())
                } else {
                    let text = resp.text().unwrap_or_default();
                    Err(format!("Erreur {}: {}", status.as_u16(), text))
                }
            }
            "ollama" => {
                let url = base_url.unwrap_or_else(|| "http://localhost:11434".to_string());
                let body = serde_json::json!({
                    "model": model,
                    "prompt": "ping",
                    "stream": false
                });
                let resp = client
                    .post(format!("{}/api/generate", url))
                    .json(&body)
                    .send()
                    .map_err(|e| e.to_string())?;
                let status = resp.status();
                if status.is_success() {
                    Ok("Connexion établie".to_string())
                } else {
                    let text = resp.text().unwrap_or_default();
                    Err(format!("Erreur {}: {}", status.as_u16(), text))
                }
            }
            p => Err(format!("Provider '{}' non supporté pour le test de connexion", p)),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Retourne la configuration LLM unique (id = 'default') sans exposer la clé API en clair
#[tauri::command]
pub fn get_llm_config(db: State<Mutex<Connection>>) -> Result<LlmConfigView, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT provider, api_key, base_url, model, updated_at
         FROM llm_config WHERE id = 'default'",
        [],
        |row| {
            let api_key: Option<String> = row.get(1)?;
            Ok(LlmConfigView {
                provider: row.get(0)?,
                has_api_key: api_key.as_deref().map(|k| !k.is_empty()).unwrap_or(false),
                base_url: row.get(2)?,
                model: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Met à jour la configuration LLM ; seul l'enregistrement 'default' existe en base.
/// Si api_key est None ou chaîne vide, la clé existante en base est préservée.
#[tauri::command]
pub fn save_llm_config(payload: LlmConfig, db: State<Mutex<Connection>>) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    db.execute(
        "UPDATE llm_config
         SET provider=?1, api_key=COALESCE(NULLIF(?2, ''), api_key), base_url=?3, model=?4, updated_at=?5
         WHERE id = 'default'",
        rusqlite::params![payload.provider, payload.api_key, payload.base_url, payload.model, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Retourne la configuration d'un réseau social donné
#[tauri::command]
pub fn get_social_config(
    platform: String,
    db: State<Mutex<Connection>>,
) -> Result<SocialConfig, String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT platform, system_prompt, tone, target_audience, updated_at
         FROM social_config WHERE platform = ?1",
        rusqlite::params![platform],
        |row| {
            Ok(SocialConfig {
                platform: row.get(0)?,
                system_prompt: row.get(1)?,
                tone: row.get(2)?,
                target_audience: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Met à jour la configuration d'un réseau social ; valide la plateforme avant l'UPDATE
#[tauri::command]
pub fn save_social_config(
    platform: String,
    payload: SocialConfig,
    db: State<Mutex<Connection>>,
) -> Result<(), String> {
    // Validation explicite côté Rust pour un message d'erreur clair au frontend
    if !["linkedin", "facebook", "twitter"].contains(&platform.as_str()) {
        return Err(format!("plateforme invalide : '{}'", platform));
    }
    let db = db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    db.execute(
        "UPDATE social_config
         SET system_prompt=?1, tone=?2, target_audience=?3, updated_at=?4
         WHERE platform = ?5",
        rusqlite::params![
            payload.system_prompt,
            payload.tone,
            payload.target_audience,
            now,
            platform
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Génère un post pour un réseau social via l'API LLM configurée en streaming SSE.
/// Les chunks de texte sont émis via l'event "post_chunk", la fin via "post_done",
/// les erreurs via "post_error" — le verrou DB est libéré avant tout await réseau.
#[tauri::command]
pub async fn generate_post(
    platform: String,
    subject: String,
    app_handle: tauri::AppHandle,
    db: State<'_, Mutex<Connection>>,
) -> Result<(), String> {
    // Phase 1 : lecture DB — verrou libéré dès la fin du bloc avant tout await
    let (provider, api_key, model, system_prompt, tone, target_audience) = {
        let guard = db.lock().map_err(|e| e.to_string())?;

        let (provider, api_key, model) = guard
            .query_row(
                "SELECT provider, api_key, model FROM llm_config WHERE id = 'default'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;

        let (system_prompt, tone, target_audience) = guard
            .query_row(
                "SELECT system_prompt, tone, target_audience FROM social_config WHERE platform = ?1",
                rusqlite::params![platform],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;

        (provider, api_key, model, system_prompt, tone, target_audience)
    };

    // Validation : seul Anthropic est supporté pour le streaming SSE pour l'instant
    if provider != "anthropic" {
        app_handle
            .emit("post_error", format!("Provider '{}' non supporté pour la génération", provider))
            .ok();
        return Ok(());
    }

    let key = match api_key {
        Some(k) if !k.is_empty() => k,
        _ => {
            app_handle.emit("post_error", "Clé API Anthropic manquante — configurez-la dans Paramètres > Modèle IA").ok();
            return Ok(());
        }
    };

    // Prompt de base spécifique à la plateforme — toujours actif, garantit un output
    // ready-to-post sans texte d'accompagnement, indépendamment de la social_config.
    let platform_base = match platform.as_str() {
        "linkedin" => concat!(
            "Tu es un expert en personal branding LinkedIn. ",
            "Génère un post LinkedIn professionnel et engageant sur le sujet demandé. ",
            "RÈGLE ABSOLUE : réponds UNIQUEMENT avec le texte du post, prêt à être collé directement dans LinkedIn. ",
            "Zéro introduction, zéro explication, zéro commentaire autour du post. ",
            "Format : paragraphes courts, sauts de ligne naturels, emojis sobres si pertinents, pas de hashtags automatiques.",
        ),
        "facebook" => concat!(
            "Tu es un expert en community management Facebook. ",
            "Génère un post Facebook chaleureux et engageant sur le sujet demandé. ",
            "RÈGLE ABSOLUE : réponds UNIQUEMENT avec le texte du post, prêt à être collé directement dans Facebook. ",
            "Zéro introduction, zéro explication, zéro commentaire autour du post. ",
            "Format : ton accessible et conversationnel, emojis bienvenus, longueur modérée.",
        ),
        "twitter" => concat!(
            "Tu es un expert en communication Twitter/X. ",
            "Génère un tweet percutant et concis sur le sujet demandé, 280 caractères maximum. ",
            "RÈGLE ABSOLUE : réponds UNIQUEMENT avec le texte du tweet, prêt à être posté. ",
            "Zéro introduction, zéro explication, une seule formulation directe et impactante.",
        ),
        _ => concat!(
            "Génère un post pour réseau social sur le sujet demandé. ",
            "RÈGLE ABSOLUE : réponds UNIQUEMENT avec le texte du post. ",
            "Aucun commentaire, aucune explication autour du contenu.",
        ),
    };

    // Le system_prompt utilisateur vient en complément du prompt de base (personnalisation)
    let mut system = if system_prompt.is_empty() {
        platform_base.to_string()
    } else {
        format!("{}\n\n{}", platform_base, system_prompt)
    };
    if !tone.is_empty() {
        system.push_str(&format!("\n\nTon attendu : {}", tone));
    }
    if !target_audience.is_empty() {
        system.push_str(&format!("\nAudience cible : {}", target_audience));
    }

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "stream": true,
        "system": system,
        "messages": [{"role": "user", "content": subject}]
    });

    // Phase 2 : requête HTTP async — pas de blocking, pas de Mutex ouvert
    let client = reqwest::Client::new();
    let resp = match client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            app_handle.emit("post_error", e.to_string()).ok();
            return Ok(());
        }
    };

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        app_handle
            .emit("post_error", format!("Erreur HTTP {} : {}", status, text))
            .ok();
        return Ok(());
    }

    // Phase 3 : lecture SSE ligne par ligne
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => {
                app_handle.emit("post_error", e.to_string()).ok();
                return Ok(());
            }
        };

        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // On traite toutes les lignes complètes disponibles dans le buffer
        loop {
            match buffer.find('\n') {
                None => break,
                Some(pos) => {
                    let line = buffer[..pos].trim().to_string();
                    buffer = buffer[pos + 1..].to_string();

                    if let Some(data) = line.strip_prefix("data: ") {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            match json["type"].as_str() {
                                Some("content_block_delta") => {
                                    if let Some(text) = json["delta"]["text"].as_str() {
                                        if !text.is_empty() {
                                            app_handle.emit("post_chunk", text).ok();
                                        }
                                    }
                                }
                                Some("message_stop") => {
                                    app_handle.emit("post_done", "").ok();
                                    return Ok(());
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    app_handle.emit("post_done", "").ok();
    Ok(())
}

/// Supprime une entrée de build
#[tauri::command]
pub fn delete_build_entry(id: String, db: State<Mutex<Connection>>) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM build_entries WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Met à jour le contenu d'une entrée de build existante et rafraîchit updated_at
#[tauri::command]
pub fn update_build_entry(
    id: String,
    payload: BuildEntryPayload,
    db: State<Mutex<Connection>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    db.execute(
        "UPDATE build_entries
         SET content = ?1, last_actions = ?2, next_challenges = ?3, updated_at = ?4
         WHERE id = ?5",
        rusqlite::params![payload.content, payload.last_actions, payload.next_challenges, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
