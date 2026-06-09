use std::fs;

#[tauri::command]
pub fn save_compressed(path: &str, content: &str) -> Result<(), String> {
    let compressed = zstd::stream::encode_all(content.as_bytes(), 0)
        .map_err(|e| format!("Failed to compress: {e}"))?;
    log::info!("zstd: {} -> {} bytes", content.len(), compressed.len());
    fs::write(path, compressed).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn read_compressed(path: &str) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    let decompressed = zstd::stream::decode_all(data.as_slice())
        .map_err(|e| format!("Failed to decompress: {e}"))?;
    String::from_utf8(decompressed).map_err(|e| format!("Invalid UTF-8: {e}"))
}
