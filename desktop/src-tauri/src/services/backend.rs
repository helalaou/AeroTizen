//! Local backend identity. Startup never depends on a child process or a TV.
use crate::models::DesktopStatus;
pub fn status() -> DesktopStatus {
    DesktopStatus {
        version: env!("CARGO_PKG_VERSION").into(),
    }
}
