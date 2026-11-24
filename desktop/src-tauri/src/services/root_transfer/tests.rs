use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use tokio::net::TcpStream;
fn pairing() -> (Vec<u8>, String) {
    let pairing = crate::services::root_package::pairing(&"1".repeat(32)).unwrap();
    (
        STANDARD
            .decode(pairing["server_pfx"].as_str().unwrap())
            .unwrap(),
        pairing["certificate_sha256"].as_str().unwrap().into(),
    )
}
async fn connect(port: u16, pin: &str) -> tokio_native_tls::TlsStream<TcpStream> {
    let connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .use_sni(false)
        .build()
        .unwrap();
    let socket = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
        .await
        .unwrap();
    let socket = tokio_native_tls::TlsConnector::from(connector)
        .connect("localhost", socket)
        .await
        .unwrap();
    let certificate = socket
        .get_ref()
        .peer_certificate()
        .unwrap()
        .unwrap()
        .to_der()
        .unwrap();
    assert_eq!(sha256_hex(&certificate), pin);
    socket
}
#[tokio::test]
async fn private_input_requires_the_saved_certificate_expected_peer_and_exact_one_time_token() {
    let (pfx, pin) = pairing();
    assert!(identity(&pfx, &"a".repeat(64)).is_err());
    for scenario in ["success", "wrong-token", "oversized-token"] {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let acceptor = identity(&pfx, &pin).unwrap();
        let token = "b".repeat(AUTH_BYTES);
        let expected = b"private synthetic setup";
        let client = async {
            let mut socket = connect(port, &pin).await;
            socket
                .write_all(
                    format!(
                        "{}\n",
                        if scenario == "success" {
                            token.clone()
                        } else if scenario == "wrong-token" {
                            "c".repeat(AUTH_BYTES)
                        } else {
                            "c".repeat(AUTH_BYTES + 1)
                        }
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            let mut bytes = Vec::new();
            let _ = socket.read_to_end(&mut bytes).await;
            if scenario == "success" {
                assert_eq!(
                    u32::from_be_bytes(bytes[..4].try_into().unwrap()) as usize,
                    expected.len()
                );
                assert_eq!(&bytes[4..], expected);
            } else {
                assert!(bytes.is_empty());
            }
        };
        let ((), result) = tokio::join!(
            client,
            send(listener, acceptor, Ipv4Addr::LOCALHOST, &token, expected)
        );
        assert_eq!(result.is_ok(), scenario == "success");
    }
}
#[tokio::test]
async fn an_unexpected_peer_receives_no_tls_or_private_input_and_listener_closes() {
    let (pfx, pin) = pairing();
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let address = listener.local_addr().unwrap();
    let acceptor = identity(&pfx, &pin).unwrap();
    let token = "b".repeat(AUTH_BYTES);
    let (_, result) = tokio::join!(
        TcpStream::connect(address),
        send(
            listener,
            acceptor,
            Ipv4Addr::new(192, 0, 2, 10),
            &token,
            b"private"
        )
    );
    assert!(result.is_err());
    assert!(TcpStream::connect(address).await.is_err());
}

#[tokio::test]
async fn sdk_uploads_never_contain_private_input_and_bootstrap_fetch_receives_it_only_over_pinned_tls(
) {
    use crate::services::{
        device_connection::tests::Peer,
        sdb::sync::tests::{handshake, reply_service, upload},
    };
    let (pfx, pin) = pairing();
    let expected = b"private-root-token private-server-key";
    let expected_copy = expected.to_vec();
    let pin_copy = pin.clone();
    let files = vec![
        PayloadFile {
            name: helper_payloads::ROOT_BRIDGE_ENTRYPOINT.into(),
            bytes: b"public managed bridge".to_vec(),
        },
        PayloadFile {
            name: "AeroTizenRootBridge.runtimeconfig.json".into(),
            bytes: b"{}".to_vec(),
        },
        PayloadFile {
            name: "AeroTizenRootBridge.deps.json".into(),
            bytes: b"{}".to_vec(),
        },
    ];
    let mut peer = Peer::start(1, move |mut io, _| {
        let expected = expected_copy.clone();
        let pin = pin_copy.clone();
        async move {
            handshake(&mut io).await;
            let mut staged = Vec::new();
            for _ in 0..4 {
                let (_, bytes) = upload(&mut io, false).await;
                assert!(!bytes.windows(expected.len()).any(|part| part == expected));
                staged.push(bytes);
            }
            let script = String::from_utf8(staged.pop().unwrap()).unwrap();
            let stdout_port: u16 = script
                .split("exec 3<>/dev/tcp/127.0.0.1/")
                .nth(1)
                .unwrap()
                .split_whitespace()
                .next()
                .unwrap()
                .parse()
                .unwrap();
            let arguments: Vec<_> = script
                .lines()
                .find_map(|line| {
                    line.split_once("--bootstrap-fetch ")
                        .map(|(_, args)| args.split_whitespace().collect::<Vec<_>>())
                })
                .unwrap();
            assert_eq!(arguments.len(), 4);
            assert_eq!(arguments[0], "127.0.0.1");
            assert_eq!(arguments[2], pin);
            let mut stdout = TcpStream::connect((Ipv4Addr::LOCALHOST, stdout_port))
                .await
                .unwrap();
            let mut secured = connect(arguments[1].parse().unwrap(), &pin).await;
            secured
                .write_all(format!("{}\n", arguments[3]).as_bytes())
                .await
                .unwrap();
            let length = secured.read_u32().await.unwrap();
            let mut private = vec![0; length as usize];
            secured.read_exact(&mut private).await.unwrap();
            assert_eq!(private, expected);
            let command = reply_service(&mut io, "bootstrap command completed").await;
            assert!(command.starts_with("shell:0 appinstall tpk new2.tpk"));
            stdout
                .write_all(
                    format!(
                        "AEROTIZEN_ROOT_BOOTSTRAP={{\"passed\":true}}\n{}\nAEROTIZEN_SDK_EXIT=0\n",
                        sdk::CLEANUP_MARKER
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            stdout.shutdown().await.unwrap();
            Vec::new()
        }
    })
    .await;
    let socket = TcpStream::connect((Ipv4Addr::LOCALHOST, peer.port))
        .await
        .unwrap();
    let mut connection = Sdb::connect(Box::new(socket)).await.unwrap();
    let result = run(
        &mut connection,
        Ipv4Addr::LOCALHOST,
        &files,
        expected,
        &pfx,
        &pin,
    )
    .await
    .unwrap();
    assert_eq!(result.exit_code, 0);
    assert!(result.staging_cleaned);
    drop(connection);
    peer.finish().await;
}
