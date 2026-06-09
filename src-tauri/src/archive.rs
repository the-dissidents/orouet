use std::fs;

#[tauri::command]
pub fn save_compressed(path: String, content: String) -> Result<(), String> {
    let compressed = zstd::bulk::compress(content.as_bytes(), 0)
        .map_err(|e| format!("Failed to compress: {}", e))?;
    fs::write(&path, compressed).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn read_compressed(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let decompressed = zstd::bulk::decompress(&data, 100 * 1024 * 1024)
        .map_err(|e| format!("Failed to decompress: {}", e))?;
    String::from_utf8(decompressed).map_err(|e| format!("Invalid UTF-8: {}", e))
}
