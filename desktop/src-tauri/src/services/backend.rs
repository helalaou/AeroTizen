//! Local backend identity. Startup never depends on a child process or a TV.
use crate::models::BackendStatus;
pub fn status() -> BackendStatus {
    BackendStatus {
        version: env!("ROOT_RUNTIME_VERSION").into(),
    }
}
