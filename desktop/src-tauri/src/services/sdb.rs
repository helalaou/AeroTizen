//! Typed SDB services for app inventory and reviewed removal. No arbitrary shell API.
pub(super) mod sync;
use std::io;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub(super) const PORT: u16 = 26101;
const VERSION: u32 = 0x0100_0000;
const MAX_FRAME_BYTES: usize = 256 * 1024;
const MAX_SERVICE_FRAMES: usize = 4096;
const MAX_INVENTORY_BYTES: usize = 1024 * 1024;
const MAX_IDENTITY_BYTES: usize = 4096;
const MAX_CAPABILITY_BYTES: usize = 64 * 1024;
const MAX_UNINSTALL_BYTES: usize = 64 * 1024;
const HEADER_BYTES: usize = 24;
const CNXN: u32 = u32::from_le_bytes(*b"CNXN");
const OPEN: u32 = u32::from_le_bytes(*b"OPEN");
const OKAY: u32 = u32::from_le_bytes(*b"OKAY");
const WRTE: u32 = u32::from_le_bytes(*b"WRTE");
const CLSE: u32 = u32::from_le_bytes(*b"CLSE");
const HOST_BANNER: &[u8] = b"host::aerotizen\0";
const WATCHER_SERVICE: &[u8] = b"tcp:47790\0";

pub(super) trait SdbIo: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> SdbIo for T {}
pub(super) type Socket = Box<dyn SdbIo>;

#[derive(Clone, Copy)]
pub(super) enum ReadCommand {
    Identity,
    AppList,
    Capabilities,
}

impl ReadCommand {
    fn service(self) -> &'static [u8] {
        match self {
            Self::Identity => b"shell:0 getduid\0",
            Self::AppList => b"shell:0 vd_applist\0",
            Self::Capabilities => b"capability:\0",
        }
    }
    fn limit(self) -> usize {
        match self {
            Self::Identity => MAX_IDENTITY_BYTES,
            Self::AppList => MAX_INVENTORY_BYTES,
            Self::Capabilities => MAX_CAPABILITY_BYTES,
        }
    }
}

struct Frame {
    command: u32,
    remote: u32,
    local: u32,
    payload: Vec<u8>,
}

pub(super) fn valid_identifier(value: &str) -> bool {
    const MAX_IDENTIFIER_BYTES: usize = 256;
    !value.is_empty()
        && value.len() <= MAX_IDENTIFIER_BYTES
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
}

fn protocol_error() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "Invalid SDB reply")
}

async fn send(
    io: &mut (impl SdbIo + ?Sized),
    command: u32,
    local: u32,
    remote: u32,
    payload: &[u8],
) -> io::Result<()> {
    let fields = [
        command,
        local,
        remote,
        payload.len() as u32,
        payload
            .iter()
            .fold(0_u32, |sum, b| sum.wrapping_add(*b as u32)),
        !command,
    ];
    let mut header = [0; HEADER_BYTES];
    for (part, value) in header.as_chunks_mut::<4>().0.iter_mut().zip(fields) {
        part.copy_from_slice(&value.to_le_bytes());
    }
    io.write_all(&header).await?;
    io.write_all(payload).await
}

async fn receive(io: &mut (impl SdbIo + ?Sized)) -> io::Result<Frame> {
    let mut header = [0; HEADER_BYTES];
    io.read_exact(&mut header).await?;
    let mut fields = [0_u32; 6];
    for (value, part) in fields.iter_mut().zip(header.as_chunks::<4>().0) {
        *value = u32::from_le_bytes(*part);
    }
    if fields[5] != !fields[0] || fields[3] as usize > MAX_FRAME_BYTES {
        return Err(protocol_error());
    }
    // Match Samsung/CLI framing: checksum is sent, but peers need not supply it.
    let mut payload = vec![0; fields[3] as usize];
    io.read_exact(&mut payload).await?;
    Ok(Frame {
        command: fields[0],
        remote: fields[1],
        local: fields[2],
        payload,
    })
}

pub(super) struct Sdb {
    io: Socket,
    next_id: u32,
}

impl Sdb {
    pub async fn connect(mut io: Socket) -> io::Result<Self> {
        send(&mut *io, CNXN, VERSION, MAX_FRAME_BYTES as u32, HOST_BANNER).await?;
        if receive(&mut *io).await?.command != CNXN {
            return Err(protocol_error());
        }
        Ok(Self { io, next_id: 1 })
    }

    pub async fn read(&mut self, command: ReadCommand) -> io::Result<String> {
        self.service(command.service(), command.limit(), None).await
    }

    pub async fn uninstall(&mut self, app_id: &str) -> io::Result<String> {
        if !valid_identifier(app_id) {
            return Err(protocol_error());
        }
        let service = format!("shell:0 vd_appuninstall {app_id}\0");
        self.service(service.as_bytes(), MAX_UNINSTALL_BYTES, None)
            .await
    }

    pub async fn sdk_execute(&mut self, launch: &super::sdk::Launch) -> io::Result<String> {
        const MAX_SDK_OUTPUT_BYTES: usize = 128 * 1024;
        self.service(&launch.service(), MAX_SDK_OUTPUT_BYTES, None)
            .await
    }
    pub async fn launch_launcher(&mut self) -> io::Result<String> {
        self.service(
            format!("shell:0 was_execute {}\0", crate::models::LAUNCHER_APP_ID).as_bytes(),
            8192,
            None,
        )
        .await
    }

    pub async fn watcher_status(&mut self) -> io::Result<String> {
        const WATCHER_REQUEST: &[u8] =
            b"GET / HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n";
        const MAX_WATCHER_BYTES: usize = 128 * 1024;
        self.service(WATCHER_SERVICE, MAX_WATCHER_BYTES, Some(WATCHER_REQUEST))
            .await
    }

    pub async fn diagnostics(&mut self, limit: usize) -> io::Result<String> {
        const REQUEST: &[u8] = b"GET /diagnostics/logs HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\nX-AeroTizen-Diagnostics: 1\r\n\r\n";
        self.service(WATCHER_SERVICE, limit, Some(REQUEST)).await
    }

    async fn service(
        &mut self,
        service: &[u8],
        limit: usize,
        request: Option<&[u8]>,
    ) -> io::Result<String> {
        let local = self.next_id;
        self.next_id = self.next_id.checked_add(1).ok_or_else(protocol_error)?;
        send(&mut *self.io, OPEN, local, 0, service).await?;
        let mut remote = None;
        let mut output = Vec::new();
        let mut sent = false;
        for _ in 0..MAX_SERVICE_FRAMES {
            let frame = receive(&mut *self.io).await?;
            if frame.local != local {
                continue;
            }
            match frame.command {
                OKAY => {
                    remote = Some(frame.remote);
                    if !sent {
                        if let Some(request) = request {
                            send(&mut *self.io, WRTE, local, frame.remote, request).await?;
                        }
                        sent = true;
                    }
                }
                WRTE => {
                    if frame.payload.len() > limit - output.len() {
                        return Err(protocol_error());
                    }
                    output.extend_from_slice(&frame.payload);
                    send(&mut *self.io, OKAY, local, frame.remote, &[]).await?;
                }
                CLSE => {
                    if remote.is_some() {
                        send(&mut *self.io, CLSE, local, frame.remote, &[]).await?;
                    }
                    return Ok(String::from_utf8_lossy(&output).into_owned());
                }
                _ => return Err(protocol_error()),
            }
        }
        Err(protocol_error())
    }
}

#[cfg(test)]
pub(crate) mod tests;
