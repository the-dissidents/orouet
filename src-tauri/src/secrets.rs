use sha2::{Sha256, Digest};

const APP_PEPPER: [u8; 32] = [ 0x83, 0x40, 0xc5, 0x2f, 0xb7, 0xd4, 0xdd, 0xc0, 0x09, 0x3b, 0x0c, 0xb4, 0xd1, 0x33, 0xa5, 0xa6, 0xe0, 0x90, 0xdc, 0xf5, 0x03, 0xd2, 0x79, 0x96, 0x22, 0xdd, 0x19, 0x3d, 0xcf, 0x10, 0xe4, 0x10, ];

pub fn derive_hardware_password() -> Vec<u8> {
    // Fallback prevents app crash if UID generation fails, but reduces security on failure.
    let uid = machine_uid::get().unwrap_or_else(|_| {
        log::warn!("unable to get machine_uid");
        "fallback_device_id_x89".to_string()
    });

    let mut hasher = Sha256::new();
    hasher.update(APP_PEPPER);
    hasher.update(uid.as_bytes());

    hasher.finalize().to_vec()
}
