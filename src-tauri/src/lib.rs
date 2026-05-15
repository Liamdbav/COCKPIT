use std::sync::Mutex;

// Manager est nécessaire pour appeler app.manage() et injecter l'état global
use tauri::Manager;

pub mod commands;
pub mod db;
pub mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // On initialise la DB dès le démarrage pour qu'elle soit prête
            // avant que la fenêtre ne charge et n'appelle les commandes
            let conn = db::init_db(app.handle()).map_err(|e| {
                log::error!("Échec init DB : {}", e);
                e
            })?;

            // Mutex car les commandes Tauri peuvent être appelées depuis plusieurs
            // threads du runtime async — la connexion rusqlite n'est pas Send+Sync seule
            app.manage(Mutex::new(conn));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard_projects,
            commands::get_all_clients,
            commands::get_client_detail,
            commands::create_client,
            commands::create_project,
            commands::update_project_status,
            commands::add_build_entry,
            commands::update_build_entry,
            commands::update_client,
            commands::get_all_projects,
            commands::delete_client,
            commands::delete_project,
            commands::delete_build_entry,
            commands::get_llm_config,
            commands::save_llm_config,
            commands::get_social_config,
            commands::save_social_config,
            commands::test_llm_connection,
            commands::generate_post,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
