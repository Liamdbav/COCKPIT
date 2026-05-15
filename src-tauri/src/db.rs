use rusqlite::Connection;
// Manager donne accès à app_handle.path() qui résout les dossiers système
use tauri::Manager;

/// Ouvre (ou crée) la base de données SQLite de l'application et joue la migration initiale.
/// Retourner la connexion plutôt qu'un pool suffit : l'accès concurrent sera géré via Mutex dans lib.rs.
pub fn init_db<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
) -> Result<Connection, Box<dyn std::error::Error>> {
    // app_data_dir() donne le bon dossier par OS :
    //   macOS → ~/Library/Application Support/cockpit/
    //   Linux → ~/.local/share/cockpit/
    let data_dir = app_handle
        .path()
        .app_data_dir()?;

    // On s'assure que le dossier existe avant d'y créer le fichier DB
    std::fs::create_dir_all(&data_dir)?;

    let db_path = data_dir.join("cockpit.db");
    let conn = Connection::open(&db_path)?;

    // SQLite désactive les clés étrangères par défaut pour des raisons historiques ;
    // on les active explicitement pour que les ON DELETE CASCADE fonctionnent
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // include_str! compile chaque fichier SQL directement dans le binaire.
    // Les migrations sont jouées dans l'ordre numérique ; chaque table utilise
    // IF NOT EXISTS / INSERT OR IGNORE pour rendre l'ensemble idempotent.
    conn.execute_batch(include_str!("../migrations/001_init.sql"))?;
    conn.execute_batch(include_str!("../migrations/002_marketing.sql"))?;

    Ok(conn)
}
