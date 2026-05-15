use serde::{Deserialize, Serialize};

// --- Types retournés au frontend (Serialize + Deserialize) ---

/// Vue allégée d'un projet pour le tableau de bord principal
#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardProject {
    pub id: String,
    pub name: String,
    pub client_id: String,
    pub client_name: String,
    pub client_type: String,
    pub status: String,
    pub created_at: String,
}

/// Ligne dans la liste des clients (pas les détails complets)
#[derive(Debug, Serialize, Deserialize)]
pub struct ClientListItem {
    pub id: String,
    pub name: String,
    pub client_type: String, // "individual" | "company"
    pub email: Option<String>,
    pub has_active_project: bool,
}

/// Fiche client complète avec tous ses projets et leurs entrées de build
#[derive(Debug, Serialize, Deserialize)]
pub struct ClientDetail {
    pub id: String,
    pub name: String,
    pub client_type: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub projects: Vec<ProjectWithEntries>,
}

/// Projet avec l'historique complet de ses entrées de build
#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectWithEntries {
    pub id: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
    pub delivered_at: Option<String>,
    pub entries: Vec<BuildEntry>,
}

/// Journal de bord d'une session de travail sur un projet
#[derive(Debug, Serialize, Deserialize)]
pub struct BuildEntry {
    pub id: String,
    pub project_id: String,
    pub content: String,
    pub last_actions: String,
    pub next_challenges: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Ligne dans la liste d'archive des projets (tous statuts confondus)
#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectListItem {
    pub id: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
    pub delivered_at: Option<String>,
    pub client_id: String,
    pub client_name: String,
    pub entry_count: i64,
}

/// Configuration du LLM utilisé pour la génération de contenu.
/// ⚠ Ne jamais loguer cette struct (api_key est sensible) : interdire println!, dbg! et log::debug! sur LlmConfig.
#[derive(Debug, Serialize, Deserialize)]
pub struct LlmConfig {
    pub id: String,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: String,
    pub updated_at: String,
}

/// Vue publique de LlmConfig renvoyée au frontend — la clé API ne quitte jamais le backend en clair.
#[derive(Debug, Serialize)]
pub struct LlmConfigView {
    pub provider: String,
    pub has_api_key: bool,
    pub base_url: Option<String>,
    pub model: String,
    pub updated_at: String,
}

/// Configuration par réseau social pour la génération de contenu marketing.
/// ⚠ Ne jamais loguer cette struct en production : les prompts système peuvent être confidentiels.
#[derive(Debug, Serialize, Deserialize)]
pub struct SocialConfig {
    pub platform: String,
    pub system_prompt: String,
    pub tone: String,
    pub target_audience: String,
    pub updated_at: String,
}

// --- Payloads entrants depuis le frontend (Deserialize uniquement) ---

/// Données nécessaires pour créer un nouveau client
#[derive(Debug, Deserialize)]
pub struct CreateClientPayload {
    pub client_type: String,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
}

/// Données nécessaires pour créer un projet rattaché à un client existant
#[derive(Debug, Deserialize)]
pub struct CreateProjectPayload {
    pub client_id: String,
    pub name: String,
}

/// Données pour mettre à jour un client existant
#[derive(Debug, Deserialize)]
pub struct UpdateClientPayload {
    pub client_type: String,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
}

/// Données pour créer ou mettre à jour une entrée de build
#[derive(Debug, Deserialize)]
pub struct BuildEntryPayload {
    pub project_id: String,
    pub content: String,
    pub last_actions: String,
    pub next_challenges: String,
}
