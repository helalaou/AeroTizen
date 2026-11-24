//! Bounded, acknowledged uploads. A failed transfer is never replayed.
use super::*;
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
const CHUNK_BYTES: usize = 64 * 1024;
const ACK_FRAMES: usize = 32;
const MAX_PATH_BYTES: usize = 1024;
const MAX_INSTALL_REPLY_BYTES: usize = 64 * 1024;
const MAX_PROFILE_BYTES: u64 = 512 * 1024;
const DEFAULT_TOOLS_PATH: &str = "/home/owner/share/tmp/sdk_tools";

pub(in crate::services) fn tools_path(capabilities: &str) -> io::Result<String> {
    use regex::Regex;
    use std::sync::OnceLock;
    static VALID: OnceLock<Regex> = OnceLock::new();
    let path = capabilities
        .lines()
        .filter_map(|line| line.split_once(':'))
        .rfind(|(key, _)| key.trim_matches([' ', '\0', '\u{fffd}']) == "sdk_toolpath")
        .map_or(DEFAULT_TOOLS_PATH, |(_, value)| {
            value.trim_matches(super::super::text::python_whitespace)
        });
    if path.len() > MAX_PATH_BYTES
        || !VALID
            .get_or_init(|| Regex::new(r"^(?:/[A-Za-z0-9_-][A-Za-z0-9_.-]*)+/?$").unwrap())
            .is_match(path)
    {
        return Err(protocol_error());
    }
    Ok(path.trim_end_matches('/').into())
}
impl Sdb {
    async fn sync_frame(&mut self, local: u32) -> io::Result<Frame> {
        for _ in 0..ACK_FRAMES {
            let frame = receive(&mut *self.io).await?;
            if frame.local == local {
                return Ok(frame);
            }
        }
        Err(protocol_error())
    }
    async fn sync_write(
        &mut self,
        local: u32,
        remote: u32,
        tag: &[u8; 4],
        data: &[u8],
    ) -> io::Result<()> {
        let mut packet = Vec::with_capacity(8 + data.len());
        packet.extend_from_slice(tag);
        packet.extend_from_slice(&(data.len() as u32).to_le_bytes());
        packet.extend_from_slice(data);
        send(&mut *self.io, WRTE, local, remote, &packet).await?;
        let ack = self.sync_frame(local).await?;
        if ack.command != OKAY || ack.remote != remote {
            return Err(protocol_error());
        }
        Ok(())
    }
    pub(in crate::services) async fn push(
        &mut self,
        path: &str,
        input: &mut (impl AsyncRead + Unpin),
        maximum: u64,
    ) -> io::Result<()> {
        if path.len() > MAX_PATH_BYTES || !path.starts_with('/') || path.bytes().any(|b| b == 0) {
            return Err(protocol_error());
        }
        let local = self.next_id;
        self.next_id = self.next_id.checked_add(1).ok_or_else(protocol_error)?;
        send(&mut *self.io, OPEN, local, 0, b"sync:\0").await?;
        let frame = self.sync_frame(local).await?;
        if frame.command != OKAY {
            return Err(protocol_error());
        }
        let remote = frame.remote;
        self.sync_write(local, remote, b"SEND", path.as_bytes())
            .await?;
        let mut buffer = vec![0; CHUNK_BYTES];
        let mut total = 0_u64;
        loop {
            let count = input.read(&mut buffer).await?;
            if count == 0 {
                break;
            }
            total += count as u64;
            if total > maximum {
                return Err(protocol_error());
            }
            self.sync_write(local, remote, b"DATA", &buffer[..count])
                .await?;
        }
        let seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| protocol_error())?
            .as_secs();
        let seconds = u32::try_from(seconds).map_err(|_| protocol_error())?;
        // Samsung's CLI uses DONE + length(4) + timestamp, rather than classic ADB DONE.
        self.sync_write(local, remote, b"DONE", &seconds.to_le_bytes())
            .await?;
        let mut reply = Vec::new();
        for _ in 0..ACK_FRAMES {
            let frame = self.sync_frame(local).await?;
            if frame.command != WRTE
                || frame.remote != remote
                || frame.payload.len() > MAX_INSTALL_REPLY_BYTES - reply.len()
            {
                return Err(protocol_error());
            }
            reply.extend_from_slice(&frame.payload);
            send(&mut *self.io, OKAY, local, remote, &[]).await?;
            if reply.len() >= 8 {
                send(&mut *self.io, CLSE, local, remote, &[]).await?;
                return if &reply[..4] == b"OKAY" {
                    Ok(())
                } else {
                    Err(protocol_error())
                };
            }
        }
        Err(protocol_error())
    }
    pub async fn install_widget(
        &mut self,
        app_id: &str,
        tools: &str,
        profile: &Path,
        widget: &Path,
    ) -> io::Result<String> {
        if !valid_identifier(app_id) || tools_path(&format!("sdk_toolpath:{tools}"))? != tools {
            return Err(protocol_error());
        }
        // Open both files before the first transfer. Neither path comes from the TV.
        let mut profile = tokio::fs::File::open(profile).await?;
        let mut widget = tokio::fs::File::open(widget).await?;
        if profile.metadata().await?.len() > MAX_PROFILE_BYTES
            || widget.metadata().await?.len() > super::super::local_widget::MAX_WIDGET_BYTES
        {
            return Err(protocol_error());
        }
        self.push(
            &format!("{tools}/device-profile.xml"),
            &mut profile,
            MAX_PROFILE_BYTES,
        )
        .await?;
        let path = format!("{tools}/{}.wgt", app_id.split('.').next().unwrap());
        self.push(
            &path,
            &mut widget,
            super::super::local_widget::MAX_WIDGET_BYTES,
        )
        .await?;
        self.service(
            format!("shell:0 vd_appinstall {app_id} {path}\0").as_bytes(),
            MAX_INSTALL_REPLY_BYTES,
            None,
        )
        .await
    }
}
#[cfg(test)]
pub(crate) mod tests;
