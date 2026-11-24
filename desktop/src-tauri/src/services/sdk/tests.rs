use super::*;
use crate::services::{
    device_connection::tests::Peer,
    sdb::{
        sync::tests::{handshake, read_reply, upload},
        tests::bytes,
    },
};
use serde_json::Value;
use tokio::{io::AsyncWriteExt, net::TcpStream};
fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../tests/fixtures/sdk-transport.json"
    ))
    .unwrap()
}
fn files() -> Vec<PayloadFile> {
    fixture()["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|file| PayloadFile {
            name: file["name"].as_str().unwrap().into(),
            bytes: bytes(file["data_hex"].as_str().unwrap()),
        })
        .collect()
}
#[test]
fn staged_script_and_single_use_launch_match_the_existing_cli_transport() {
    let fixture = fixture();
    let script = script(
        &files(),
        "Query.dll",
        &["request.json"],
        "192.0.2.1".parse().unwrap(),
        5678,
        "aaaaaaaaaaaa",
    )
    .unwrap();
    assert_eq!(script.body, fixture["script"]);
    assert_eq!(script.launch.command, fixture["command"]);
    assert_eq!(script.stage, fixture["stage"]);
    for (file, path) in files().iter().zip(&script.paths) {
        assert_eq!(*path, fixture["paths"][&file.name]);
    }
    for bad in ["../Query.dll", "space name", "x;reboot"] {
        let files = vec![PayloadFile {
            name: bad.into(),
            bytes: vec![0],
        }];
        assert!(super::script(&files, bad, &[], Ipv4Addr::LOCALHOST, 1, "aaaaaaaaaaaa").is_err());
    }
    assert_eq!(quote("a'b"), "'a'\"'\"'b'");
}
#[test]
fn completion_requires_one_cleanup_and_one_exit_record_and_reports_a_missing_tv_runtime() {
    for output in [
        "",
        "AEROTIZEN_SDK_CLEANED\n",
        "AEROTIZEN_SDK_CLEANED\nAEROTIZEN_SDK_CLEANED\nAEROTIZEN_SDK_EXIT=0\n",
        "AEROTIZEN_SDK_CLEANED\nAEROTIZEN_SDK_EXIT=0\nAEROTIZEN_SDK_EXIT=0\n",
    ] {
        assert!(parse_output(output.into()).is_err());
    }
    assert_eq!(
        parse_output(format!(
            "{DOTNET_UNAVAILABLE}\n{CLEANUP_MARKER}\n{EXIT_PREFIX}127\n"
        ))
        .err()
        .unwrap()
        .code,
        "sdk_unavailable"
    );
    assert_eq!(
        parse_output(format!("helper failed\n{CLEANUP_MARKER}\n{EXIT_PREFIX}7\n"))
            .unwrap()
            .exit_code,
        7
    );
}
#[tokio::test]
async fn local_transport_uploads_only_verified_files_and_accepts_bounded_callbacks_from_the_expected_tv(
) {
    for scenario in ["success", "missing-cleanup", "oversized"] {
        let payload = files();
        let copy = payload.clone();
        let mut peer = Peer::start(1, move |mut io, _| {
            let files = copy.clone();
            async move {
                handshake(&mut io).await;
                let mut uploads = Vec::new();
                for file in &files {
                    let (path, data) = upload(&mut io, false).await;
                    assert!(path.ends_with(&file.name));
                    assert_eq!(data, file.bytes);
                    uploads.push(path);
                }
                let (stage, body) = upload(&mut io, false).await;
                let body = String::from_utf8(body).unwrap();
                let token = stage
                    .rsplit('/')
                    .next()
                    .unwrap()
                    .strip_prefix("ah-")
                    .unwrap()
                    .strip_suffix(".s")
                    .unwrap();
                let port: u16 = body
                    .split("exec 3<>/dev/tcp/127.0.0.1/")
                    .nth(1)
                    .unwrap()
                    .split_whitespace()
                    .next()
                    .unwrap()
                    .parse()
                    .unwrap();
                let expected = super::script(
                    &files,
                    "Query.dll",
                    &["request.json"],
                    Ipv4Addr::LOCALHOST,
                    port,
                    token,
                )
                .unwrap();
                assert_eq!(expected.body, body);
                let socket = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
                    .await
                    .unwrap();
                let callback = async {
                    let mut socket = socket;
                    let output = match scenario {
                        "oversized" => "x".repeat(MAX_OUTPUT_BYTES + 1),
                        "missing-cleanup" => format!("{EXIT_PREFIX}0\n"),
                        _ => format!("helper-ran\n{CLEANUP_MARKER}\n{EXIT_PREFIX}0\n"),
                    };
                    let _ = socket.write_all(output.as_bytes()).await;
                    let _ = socket.shutdown().await;
                };
                read_reply(
                    &mut io,
                    &format!("shell:{}", expected.launch.command),
                    "staged command finished",
                )
                .await;
                callback.await;
                uploads
            }
        })
        .await;
        let io = TcpStream::connect((Ipv4Addr::LOCALHOST, peer.port))
            .await
            .unwrap();
        let mut connection = Sdb::connect(Box::new(io)).await.unwrap();
        let result = run(
            &mut connection,
            Ipv4Addr::LOCALHOST,
            &payload,
            "Query.dll",
            &["request.json"],
        )
        .await;
        if scenario == "success" {
            assert_eq!(result.unwrap().exit_code, 0);
        } else {
            assert!(result.is_err(), "{scenario}");
        }
        drop(connection);
        peer.finish().await;
    }
}

#[tokio::test]
async fn unexpected_callback_peer_is_refused_and_the_owned_listener_closes() {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let address = listener.local_addr().unwrap();
    let (_, result) = tokio::join!(
        TcpStream::connect(address),
        callback(listener, Ipv4Addr::new(192, 0, 2, 10))
    );
    assert!(result.is_err());
    assert!(TcpStream::connect(address).await.is_err());
}

pub(crate) async fn serve_helper_with_args(
    io: &mut (impl crate::services::sdb::SdbIo + ?Sized),
    entrypoint: &str,
    names: &[&str],
    output: &str,
    args: &[&str],
) -> Vec<PayloadFile> {
    let mut payloads = Vec::new();
    let mut staged_token = String::new();
    for name in names {
        let (path, bytes) = upload(io, false).await;
        assert!(path.ends_with(&format!("-{name}")));
        let prefix = path
            .rsplit('/')
            .next()
            .unwrap()
            .strip_prefix("ah-")
            .unwrap();
        let token = prefix.split('-').next().unwrap();
        if staged_token.is_empty() {
            staged_token = token.into();
        } else {
            assert_eq!(staged_token, token);
        }
        payloads.push(PayloadFile {
            name: (*name).into(),
            bytes,
        });
    }
    let (stage, body) = upload(io, false).await;
    assert_eq!(stage, format!("{DIRECTORY}/ah-{staged_token}.s"));
    let body = String::from_utf8(body).unwrap();
    let port = body
        .split("exec 3<>/dev/tcp/127.0.0.1/")
        .nth(1)
        .unwrap()
        .split_whitespace()
        .next()
        .unwrap()
        .parse()
        .unwrap();
    let expected = script(
        &payloads,
        entrypoint,
        args,
        Ipv4Addr::LOCALHOST,
        port,
        &staged_token,
    )
    .unwrap();
    assert_eq!(body, expected.body);
    let mut socket = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
        .await
        .unwrap();
    read_reply(
        io,
        &format!("shell:{}", expected.launch.command),
        "staged command complete",
    )
    .await;
    socket
        .write_all(format!("{output}\n{CLEANUP_MARKER}\n{EXIT_PREFIX}0\n").as_bytes())
        .await
        .unwrap();
    socket.shutdown().await.unwrap();
    payloads
}

pub(crate) async fn serve_helper(
    io: &mut (impl crate::services::sdb::SdbIo + ?Sized),
    entrypoint: &str,
    names: &[&str],
    output: &str,
) -> Vec<PayloadFile> {
    let args = if names.contains(&"request.json") {
        vec!["request.json"]
    } else {
        vec![]
    };
    serve_helper_with_args(io, entrypoint, names, output, &args).await
}
