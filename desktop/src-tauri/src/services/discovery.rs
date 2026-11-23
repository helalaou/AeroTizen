//! Read-only SSDP discovery and Samsung's public device-info endpoint.

use super::{http::bounded_body, text::display_text};
use crate::models::{AppError, AppResult, TvCandidate};
use reqwest::{redirect::Policy, Client};
use serde_json::Value;
use std::collections::BTreeSet;
use std::future::Future;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, SocketAddrV4};
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::task::JoinSet;
use tokio::time::{timeout_at, Instant};

const SSDP_ADDRESS: SocketAddrV4 = SocketAddrV4::new(Ipv4Addr::new(239, 255, 255, 250), 1900);
const SSDP_MULTICAST_TTL: u32 = 2;
const SEARCH_WINDOW: Duration = Duration::from_secs(3);
const DEVICE_INFO_PORT: u16 = 8001;
const DEVICE_INFO_PATH: &str = "/api/v2/";
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const METADATA_WINDOW: Duration = Duration::from_secs(6);
const MAX_SSDP_RESPONSE_BYTES: usize = 4096;
const MAX_UDP_DATAGRAM_BYTES: usize = 65_535;
const MAX_DEVICE_INFO_BYTES: usize = 64 * 1024;
const MAX_CANDIDATE_HOSTS: usize = 128;
const MAX_CONCURRENT_PROBES: usize = 8;
const MAX_DISCOVERED_TVS: usize = 32;
const MAX_TEXT_CHARACTERS: usize = 256;
const DEFAULT_TV_LABEL: &str = "Samsung TV";
const SSDP_HTTP_VERSIONS: [&[u8]; 2] = [b"HTTP/1.1", b"HTTP/1.0"];
const SSDP_SUCCESS_STATUS: &[u8] = b"200";
const SAMSUNG_MARKER: &[u8] = b"samsung";
const M_SEARCH_REQUEST: &[u8] = b"M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: upnp:rootdevice\r\n\r\n";

#[derive(Clone, Copy)]
struct DiscoveryOptions {
    target: SocketAddrV4,
    search_window: Duration,
    device_info_port: u16,
    probe_timeout: Duration,
    metadata_window: Duration,
}

const DEFAULT_OPTIONS: DiscoveryOptions = DiscoveryOptions {
    target: SSDP_ADDRESS,
    search_window: SEARCH_WINDOW,
    device_info_port: DEVICE_INFO_PORT,
    probe_timeout: PROBE_TIMEOUT,
    metadata_window: METADATA_WINDOW,
};

pub async fn discover() -> AppResult<Vec<TvCandidate>> {
    discover_with_options(DEFAULT_OPTIONS).await
}

fn discovery_error(_error: impl std::error::Error) -> AppError {
    AppError::new(
        "discovery_failed",
        "TV search could not access the local network. Allow network access for AeroTizen Desktop in system settings, then retry or enter the TV IP address.",
    )
}

async fn discover_with_options(options: DiscoveryOptions) -> AppResult<Vec<TvCandidate>> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .await
        .map_err(discovery_error)?;
    socket
        .set_multicast_ttl_v4(SSDP_MULTICAST_TTL)
        .map_err(discovery_error)?;
    socket
        .send_to(M_SEARCH_REQUEST, options.target)
        .await
        .map_err(discovery_error)?;
    let hosts = collect_hosts(&socket, options.search_window).await?;
    drop(socket);
    if hosts.is_empty() {
        return Ok(Vec::new());
    }
    let client = metadata_client(options.probe_timeout)?;
    probe_hosts(hosts, options.metadata_window, move |host| {
        let client = client.clone();
        async move { read_candidate(&client, host, options.device_info_port).await }
    })
    .await
}

fn metadata_client(timeout: Duration) -> AppResult<Client> {
    Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .http1_only()
        .timeout(timeout)
        .build()
        .map_err(discovery_error)
}

async fn collect_hosts(socket: &UdpSocket, window: Duration) -> AppResult<BTreeSet<Ipv4Addr>> {
    let deadline = Instant::now() + window;
    let mut hosts = BTreeSet::new();
    // A full datagram buffer also lets Windows discard oversized replies without WSAEMSGSIZE.
    let mut packet = vec![0; MAX_UDP_DATAGRAM_BYTES];
    while Instant::now() < deadline {
        match timeout_at(deadline, socket.recv_from(&mut packet)).await {
            Err(_) => break,
            Ok(Err(error)) => return Err(discovery_error(error)),
            Ok(Ok((size, sender))) => {
                if let Some(host) = samsung_host(&packet[..size], sender) {
                    hosts.insert(host);
                    if hosts.len() == MAX_CANDIDATE_HOSTS {
                        break;
                    }
                }
            }
        }
    }
    Ok(hosts)
}

fn samsung_host(packet: &[u8], sender: SocketAddr) -> Option<Ipv4Addr> {
    let IpAddr::V4(host) = sender.ip() else {
        return None;
    };
    if host.is_unspecified()
        || host.is_multicast()
        || host == Ipv4Addr::BROADCAST
        || packet.len() > MAX_SSDP_RESPONSE_BYTES
    {
        return None;
    }
    let first_line = packet.split(|byte| *byte == b'\n').next()?;
    let mut status = first_line
        .split(|byte| byte.is_ascii_whitespace())
        .filter(|part| !part.is_empty());
    let protocol = status.next()?;
    if !SSDP_HTTP_VERSIONS
        .iter()
        .any(|version| protocol.eq_ignore_ascii_case(version))
        || status.next()? != SSDP_SUCCESS_STATUS
    {
        return None;
    }
    packet
        .windows(SAMSUNG_MARKER.len())
        .any(|part| part.eq_ignore_ascii_case(SAMSUNG_MARKER))
        .then_some(host)
}

async fn probe_hosts<Probe, ProbeFuture>(
    hosts: BTreeSet<Ipv4Addr>,
    window: Duration,
    probe: Probe,
) -> AppResult<Vec<TvCandidate>>
where
    Probe: Fn(Ipv4Addr) -> ProbeFuture,
    ProbeFuture: Future<Output = Option<TvCandidate>> + Send + 'static,
{
    let mut hosts = hosts.into_iter();
    let mut pending = JoinSet::new();
    let mut candidates = Vec::new();
    for host in hosts.by_ref().take(MAX_CONCURRENT_PROBES) {
        pending.spawn(probe(host));
    }
    let deadline = Instant::now() + window;
    while Instant::now() < deadline {
        let Ok(Some(reply)) = timeout_at(deadline, pending.join_next()).await else {
            break;
        };
        match reply {
            Ok(Some(candidate)) => candidates.push(candidate),
            Ok(None) => {}
            Err(error) => {
                pending.shutdown().await;
                return Err(discovery_error(error));
            }
        }
        if let Some(host) = hosts.next() {
            pending.spawn(probe(host));
        }
    }
    pending.shutdown().await;
    candidates.sort_unstable_by(|left, right| left.host.cmp(&right.host));
    candidates.truncate(MAX_DISCOVERED_TVS);
    Ok(candidates)
}

async fn read_candidate(client: &Client, host: Ipv4Addr, port: u16) -> Option<TvCandidate> {
    // Use the UDP sender and fixed API path, never a URL supplied in SSDP headers.
    let response = client
        .get(format!("http://{host}:{port}{DEVICE_INFO_PATH}"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body = bounded_body(response, MAX_DEVICE_INFO_BYTES).await?;
    candidate_from_json(host, &body)
}

fn candidate_from_json(host: Ipv4Addr, body: &[u8]) -> Option<TvCandidate> {
    let reply: Value = serde_json::from_slice(body).ok()?;
    let device = reply.get("device")?.as_object()?;
    Some(TvCandidate {
        host: host.to_string(),
        name: clean_text(device.get("name")),
        model: clean_text(device.get("modelName")),
    })
}

fn clean_text(value: Option<&Value>) -> String {
    display_text(value, MAX_TEXT_CHARACTERS).unwrap_or_else(|| DEFAULT_TV_LABEL.into())
}

#[cfg(test)]
mod tests;
