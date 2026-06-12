mod archive;
mod secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let hw_password = secrets::derive_hardware_password();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_stronghold::Builder::new(move |password| {
                use argon2::{hash_raw, Config, Variant, Version};

                let config = Config {
                    lanes: 4,
                    mem_cost: 10_000,
                    time_cost: 10,
                    variant: Variant::Argon2id,
                    version: Version::Version13,
                    ..Default::default()
                };

                hash_raw(password.as_ref(), &hw_password, &config)
                    .expect("failed to hash password")
            })
            .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            archive::save_compressed,
            archive::read_compressed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
