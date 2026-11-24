use super::*;
use tokio::io::duplex;

pub(crate) async fn handshake(io: &mut (impl SdbIo + ?Sized)) {
    assert_eq!(receive(io).await.unwrap().command, CNXN);
    send(io, CNXN, VERSION, 4096, b"device::TEST\0")
        .await
        .unwrap();
}
pub(crate) async fn read_reply(io: &mut (impl SdbIo + ?Sized), expected: &str, output: &str) {
    assert_eq!(reply_service(io, output).await, expected);
}
pub(crate) async fn reply_service(io: &mut (impl SdbIo + ?Sized), output: &str) -> String {
    let frame = receive(io).await.unwrap();
    assert_eq!(frame.command, OPEN);
    let service = String::from_utf8_lossy(&frame.payload)
        .trim_end_matches('\0')
        .to_owned();
    let local = frame.remote;
    let remote = local + 100;
    send(io, OKAY, remote, local, &[]).await.unwrap();
    send(io, WRTE, remote, local, output.as_bytes())
        .await
        .unwrap();
    send(io, CLSE, remote, local, &[]).await.unwrap();
    assert_eq!(receive(io).await.unwrap().command, OKAY);
    assert_eq!(receive(io).await.unwrap().command, CLSE);
    service
}
pub(crate) async fn upload(io: &mut (impl SdbIo + ?Sized), refuse: bool) -> (String, Vec<u8>) {
    let frame = receive(io).await.unwrap();
    assert_eq!(frame.command, OPEN);
    assert_eq!(frame.payload, b"sync:\0");
    let local = frame.remote;
    let remote = local + 100;
    send(io, OKAY, remote, local, &[]).await.unwrap();
    let mut path = String::new();
    let mut data = Vec::new();
    loop {
        let frame = receive(io).await.unwrap();
        assert_eq!(frame.command, WRTE);
        assert_eq!(frame.remote, local);
        assert_eq!(frame.local, remote);
        let tag = &frame.payload[..4];
        let length = u32::from_le_bytes(frame.payload[4..8].try_into().unwrap()) as usize;
        assert_eq!(frame.payload.len(), length + 8);
        match tag {
            b"SEND" => {
                assert!(path.is_empty());
                path = String::from_utf8(frame.payload[8..].to_vec()).unwrap();
            }
            b"DATA" => {
                assert!(!path.is_empty());
                assert!(length <= CHUNK_BYTES);
                data.extend_from_slice(&frame.payload[8..]);
            }
            b"DONE" => assert_eq!(length, 4),
            _ => panic!("unexpected sync tag"),
        }
        send(io, OKAY, remote, local, &[]).await.unwrap();
        if tag == b"DONE" {
            break;
        }
    }
    send(
        io,
        WRTE,
        remote,
        local,
        if refuse {
            b"FAIL\0\0\0\0"
        } else {
            b"OKAY\0\0\0\0"
        },
    )
    .await
    .unwrap();
    assert_eq!(receive(io).await.unwrap().command, OKAY);
    assert_eq!(receive(io).await.unwrap().command, CLSE);
    (path, data)
}
#[tokio::test]
async fn streaming_uploads_use_cli_packets_then_install_once_and_surface_refusal() {
    for refuse in [false, true] {
        let (client, mut peer) = duplex(256 * 1024);
        let data = vec![123; CHUNK_BYTES * 2 + 17];
        let expected = data.clone();
        let server = tokio::spawn(async move {
            handshake(&mut peer).await;
            let (path, bytes) = upload(&mut peer, refuse).await;
            assert_eq!(path, "/tmp/app.wgt");
            assert_eq!(bytes, expected);
        });
        let mut client = Sdb::connect(Box::new(client)).await.unwrap();
        let result = client
            .push("/tmp/app.wgt", &mut data.as_slice(), data.len() as u64)
            .await;
        assert_eq!(result.is_err(), refuse);
        server.await.unwrap();
    }
}
#[test]
fn untrusted_tools_paths_cannot_change_the_install_command() {
    assert_eq!(
        tools_path("sdk_toolpath:/home/owner/tools/\nother:value").unwrap(),
        "/home/owner/tools"
    );
    assert_eq!(tools_path("").unwrap(), DEFAULT_TOOLS_PATH);
    for value in [
        "/",
        "/tmp/../x",
        "/tmp//x",
        "/tmp/space here",
        "/tmp/x;reboot",
        "relative",
        "/tmp/.hidden",
    ] {
        assert!(
            tools_path(&format!("sdk_toolpath:{value}")).is_err(),
            "{value}"
        );
    }
}

#[tokio::test]
async fn root_package_upload_uses_only_the_fixed_native_install_command_and_validated_installation_id(
) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("helper.tpk");
    let data = b"signed synthetic root helper";
    std::fs::write(&path, data).unwrap();
    let installation = "1".repeat(32);
    let expected = installation.clone();
    let (client, mut peer) = duplex(256 * 1024);
    let server = tokio::spawn(async move {
        handshake(&mut peer).await;
        let (path, bytes) = upload(&mut peer, false).await;
        assert_eq!(
            path,
            format!("{DEFAULT_TOOLS_PATH}/aerotizen-root-{expected}.tpk")
        );
        assert_eq!(bytes, data);
        read_reply(
            &mut peer,
            &format!("shell:0 appinstall tpk aerotizen-root-{expected}.tpk"),
            "install completed",
        )
        .await;
    });
    let mut client = Sdb::connect(Box::new(client)).await.unwrap();
    assert!(client
        .install_root_package("../unsafe", &path)
        .await
        .is_err());
    assert_eq!(
        client
            .install_root_package(&installation, &path)
            .await
            .unwrap(),
        "install completed"
    );
    server.await.unwrap();
}
