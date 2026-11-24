use super::*;
use serde_json::Value;
use tokio::io::duplex;

pub(crate) fn bytes(value: &str) -> Vec<u8> {
    value
        .as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect()
}

pub(crate) fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../tests/fixtures/sdb-read-wire.json"
    ))
    .unwrap()
}

pub(crate) async fn serve(
    io: &mut (impl SdbIo + ?Sized),
    duids: [&str; 2],
    raw: &str,
) -> Vec<String> {
    let steps = [duids[0], raw, duids[1]]
        .into_iter()
        .enumerate()
        .map(|(i, output)| {
            (
                if i == 1 {
                    "shell:0 vd_applist"
                } else {
                    "shell:0 getduid"
                }
                .to_owned(),
                output.to_owned(),
            )
        })
        .collect();
    serve_script(io, steps).await
}

pub(crate) async fn serve_script(
    io: &mut (impl SdbIo + ?Sized),
    steps: Vec<(String, String)>,
) -> Vec<String> {
    let connect = receive(io).await.unwrap();
    assert_eq!(connect.command, CNXN);
    send(io, CNXN, VERSION, 4096, b"device::TEST\0")
        .await
        .unwrap();
    let mut services = Vec::new();
    for (index, (expected, output)) in steps.into_iter().enumerate() {
        let frame = match receive(io).await {
            Ok(frame) => frame,
            Err(_) => break,
        };
        assert_eq!(frame.command, OPEN);
        let service = String::from_utf8_lossy(&frame.payload)
            .trim_end_matches('\0')
            .to_owned();
        assert_eq!(service, expected);
        services.push(service);
        let local = frame.remote;
        assert_eq!(local, index as u32 + 1);
        let remote = 100 + local;
        send(io, OKAY, remote, local, &[]).await.unwrap();
        if expected == "tcp:47790" {
            let request = receive(io).await.unwrap();
            assert_eq!(request.command, WRTE);
            assert_eq!(
                request.payload,
                b"GET / HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n"
            );
            send(io, OKAY, remote, local, &[]).await.unwrap();
        }
        send(io, WRTE, remote, local, output.as_bytes())
            .await
            .unwrap();
        send(io, CLSE, remote, local, &[]).await.unwrap();
        assert_eq!(receive(io).await.unwrap().command, OKAY);
        assert_eq!(receive(io).await.unwrap().command, CLSE);
    }
    services
}

#[tokio::test]
async fn native_read_services_match_the_cli_wire_and_preserve_split_utf8() {
    let fixture = fixture();
    let incoming = bytes(fixture["incoming_hex"].as_str().unwrap());
    let (client, mut peer) = duplex(64 * 1024);
    let server = tokio::spawn(async move {
        peer.write_all(&incoming).await.unwrap();
        let mut written = Vec::new();
        peer.read_to_end(&mut written).await.unwrap();
        written
    });
    let mut client = Sdb::connect(Box::new(client)).await.unwrap();
    assert_eq!(
        client.read(ReadCommand::Identity).await.unwrap(),
        fixture["identity"]
    );
    assert_eq!(
        client.read(ReadCommand::AppList).await.unwrap(),
        fixture["inventory"]
    );
    assert_eq!(
        client.read(ReadCommand::Identity).await.unwrap(),
        fixture["identity"]
    );
    drop(client);
    assert_eq!(
        server.await.unwrap(),
        bytes(fixture["outgoing_hex"].as_str().unwrap())
    );
}

#[tokio::test]
async fn malformed_magic_and_oversized_frames_are_rejected_before_reading_payloads() {
    for oversized in [false, true] {
        let (mut writer, mut reader) = duplex(128);
        let mut header = Vec::new();
        for value in [
            CNXN,
            VERSION,
            4096,
            if oversized {
                MAX_FRAME_BYTES as u32 + 1
            } else {
                0
            },
            0,
            if oversized { !CNXN } else { 0 },
        ] {
            header.extend_from_slice(&value.to_le_bytes());
        }
        writer.write_all(&header).await.unwrap();
        assert_eq!(
            receive(&mut reader).await.err().unwrap().kind(),
            io::ErrorKind::InvalidData
        );
    }
}

#[tokio::test]
async fn output_and_frame_count_limits_stop_an_unclosed_service() {
    for command in [ReadCommand::Identity, ReadCommand::AppList] {
        let (client, mut peer) = duplex(64 * 1024);
        let task = tokio::spawn(async move {
            receive(&mut peer).await.unwrap();
            send(&mut peer, CNXN, VERSION, 4096, &[]).await.unwrap();
            receive(&mut peer).await.unwrap();
            send(&mut peer, OKAY, 100, 1, &[]).await.unwrap();
            let mut remaining = command.limit() + 1;
            while remaining > 0 {
                let data = vec![b'x'; remaining.min(MAX_FRAME_BYTES)];
                remaining -= data.len();
                send(&mut peer, WRTE, 100, 1, &data).await.unwrap();
                if remaining > 0 {
                    receive(&mut peer).await.unwrap();
                }
            }
        });
        let mut client = Sdb::connect(Box::new(client)).await.unwrap();
        assert_eq!(
            client.read(command).await.unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        drop(client);
        task.await.unwrap();
    }
    let (client, mut peer) = duplex(64 * 1024);
    let task = tokio::spawn(async move {
        receive(&mut peer).await.unwrap();
        send(&mut peer, CNXN, VERSION, 4096, &[]).await.unwrap();
        receive(&mut peer).await.unwrap();
        for _ in 0..MAX_SERVICE_FRAMES {
            send(&mut peer, OKAY, 100, 999, &[]).await.unwrap();
        }
    });
    let mut client = Sdb::connect(Box::new(client)).await.unwrap();
    assert_eq!(
        client.read(ReadCommand::Identity).await.unwrap_err().kind(),
        io::ErrorKind::InvalidData
    );
    drop(client);
    task.await.unwrap();
}
