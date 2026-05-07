use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

struct AppState {
    db_path: PathBuf,
}

/// Returns true on first launch (no database file yet → "Set a password" UI).
/// Returns false when the database already exists → "Unlock" UI.
#[tauri::command]
fn is_new_db(state: tauri::State<Mutex<AppState>>) -> bool {
    !state.lock().unwrap().db_path.exists()
}

/// Spawn the server with the user-supplied password as the database encryption key.
/// Production: runs the compiled sidecar binary.
/// Dev: runs `pnpm dev` in the server workspace via bash.
#[tauri::command]
fn spawn_server(
    password: String,
    state: tauri::State<Mutex<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let db_path = state.lock().unwrap().db_path.clone();
    let db_path_str = db_path.to_str().unwrap().to_string();

    #[cfg(not(dev))]
    {
        app.shell()
            .sidecar("server")
            .map_err(|e| e.to_string())?
            .env("FINWISE_DB_KEY", &password)
            .env("DB_PATH", &db_path_str)
            .env("NODE_ENV", "production")
            .env("PORT", "3001")
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(dev)]
    {
        // CARGO_MANIFEST_DIR = apps/desktop/src-tauri
        // Go up 3 levels to reach the monorepo root, then into apps/server.
        let server_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent().unwrap() // apps/desktop
            .parent().unwrap() // apps
            .parent().unwrap() // monorepo root
            .join("apps/server")
            .canonicalize()
            .map_err(|e| e.to_string())?;

        let script = format!("cd '{}' && pnpm dev", server_dir.display());
        app.shell()
            .command("bash")
            .args(["-c", &script])
            .env("FINWISE_DB_KEY", &password)
            .env("DB_PATH", &db_path_str)
            .env("PORT", "3001")
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");

            let db_path = app_data_dir.join("finwise.db");
            app.manage(Mutex::new(AppState { db_path }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![is_new_db, spawn_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
