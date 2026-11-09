mod archive;
mod vcs;

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(vcs::VcsState::default())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_keyring::init())
        .invoke_handler(tauri::generate_handler![
            archive::save_compressed,
            archive::read_compressed,
            vcs::vcs_create,
            vcs::vcs_open,
            vcs::vcs_import,
            vcs::vcs_append,
            vcs::vcs_update_attrs,
            vcs::vcs_set_current,
            vcs::vcs_save_checkpoint,
            vcs::vcs_plan_path,
            vcs::vcs_count,
            vcs::vcs_save_as,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
