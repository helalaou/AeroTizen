use super::*;
use crate::models::VerifiedTv;
use tokio::{io::AsyncReadExt, net::TcpListener};

#[tokio::test]
async fn cancelling_native_root_and_button_reads_releases_the_socket_and_both_operation_locks() {
    for buttons in [false, true] {
        let directory = tempfile::tempdir().unwrap();
        let state = AppState::for_test(directory.path());
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let mut receipt: serde_json::Value =
            serde_json::from_str(include_str!("../../../../tests/fixtures/root-receipt.json"))
                .unwrap();
        receipt["bridge_port"] = json!(listener.local_addr().unwrap().port());
        let path = directory
            .path()
            .join("cli-state/root")
            .join(super::super::digest::sha256_hex(b"127.0.0.1"))
            .join("receipt.json");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, receipt.to_string()).unwrap();
        let mut tv: VerifiedTv =
            serde_json::from_str(include_str!("../../models/fixtures/verified-tv.json")).unwrap();
        tv.host = "127.0.0.1".into();
        let saved = state.profiles.save(tv).await.unwrap();
        let request = async {
            if buttons {
                super::super::buttons::list_tv_buttons(&state, saved.id, "active-root-read".into())
                    .await
                    .map(|value| serde_json::to_value(value).unwrap())
            } else {
                super::super::root::root_access_status(&state, saved.id, "active-root-read".into())
                    .await
                    .map(|value| serde_json::to_value(value).unwrap())
            }
        };
        tokio::pin!(request);
        let (mut peer, _) = tokio::select! {
            result = &mut request => panic!("root read finished before cancellation: {result:?}"),
            incoming = listener.accept() => incoming.unwrap(),
        };
        assert!(state.operation.try_lock().is_err());
        super::super::tvs::cancel_tv_read(&state, "active-root-read".into());
        assert_eq!(request.await.unwrap_err().code, "tv_read_cancelled");
        assert!(state.operation.try_lock().is_ok());
        assert!(super::super::tv_session::acquire(
            &directory.path().join("cli-state"),
            "127.0.0.1"
        )
        .await
        .is_ok());
        let mut bytes = Vec::new();
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            peer.read_to_end(&mut bytes),
        )
        .await
        .unwrap()
        .unwrap();
    }
}
