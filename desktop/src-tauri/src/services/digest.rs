use sha2::{Digest, Sha256};

pub fn sha256_hex(value: &[u8]) -> String {
    format!("{:x}", Sha256::digest(value))
}
