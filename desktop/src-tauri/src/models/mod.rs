use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;

mod apps;
mod buttons;
mod launcher;
mod root;
mod samsung;
mod tvs;
pub use apps::*;
pub use buttons::*;
pub use launcher::*;
pub use root::*;
pub use samsung::*;
pub use tvs::*;
#[cfg(test)]
mod tests;
pub fn valid_identity(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}
