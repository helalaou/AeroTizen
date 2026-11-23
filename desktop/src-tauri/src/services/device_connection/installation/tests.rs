use super::*;
use crate::services::{
    device_connection::tests::Peer,
    digest::sha256_hex,
    local_widget::tests::{config, widget},
    sdb::{
        sync::tests::{handshake, read_reply, upload},
        tests::next_service,
    },
    widget_signer::tests::profile,
};
use std::io::Read;
const DUID: &str = "test-duid";
const BEFORE: &str = "apps count: 0\n";
const AFTER: &str = "apps count: 1\napp_id=LocalApp01.Player app_title=Player app_version=1.2.0\n";
#[tokio::test]
async fn native_install_uses_reviewed_file_original_certs_and_verified_version_without_a_worker() {
    for scenario in [
        "success",
        "refused",
        "unverified",
        "stale",
        "disconnect",
        "identity",
        "no-certs",
    ] {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("Player.wgt");
        widget(&path, config().as_bytes(), Some("index.html"));
        let mut review = local_widget::inspect(path.clone()).await.unwrap();
        if scenario == "stale" {
            review.current_revision = Some("a".repeat(64));
        }
        if scenario != "no-certs" {
            profile(&directory.path().join("certs").join(DUID));
        }
        let mut tv = Peer::start(1, move |mut io, _| async move {
            handshake(&mut io).await;
            read_reply(&mut io, "shell:0 getduid", DUID).await;
            read_reply(&mut io, "shell:0 getduid", DUID).await;
            read_reply(&mut io, "shell:0 vd_applist", BEFORE).await;
            read_reply(&mut io, "shell:0 getduid", DUID).await;
            if matches!(scenario, "stale" | "no-certs") {
                return vec![];
            }
            read_reply(&mut io, "capability:", " sdk_toolpath : /tmp/sdk/\n").await;
            read_reply(
                &mut io,
                "shell:0 getduid",
                if scenario == "identity" {
                    "different-tv"
                } else {
                    DUID
                },
            )
            .await;
            if scenario == "identity" {
                return vec![];
            }
            let (path, bytes) = upload(&mut io, false).await;
            assert_eq!(path, "/tmp/sdk/device-profile.xml");
            assert_eq!(bytes, b"<profile>synthetic</profile>");
            let (path, bytes) = upload(&mut io, false).await;
            assert_eq!(path, "/tmp/sdk/LocalApp01.wgt");
            let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
            let mut content = String::new();
            archive
                .by_name("index.html")
                .unwrap()
                .read_to_string(&mut content)
                .unwrap();
            assert_eq!(content, "content");
            assert!(archive.by_name("author-signature.xml").is_ok());
            let command = "shell:0 vd_appinstall LocalApp01.Player /tmp/sdk/LocalApp01.wgt";
            if scenario == "disconnect" {
                assert_eq!(next_service(&mut io).await, command);
                return vec!["written-once".into()];
            }
            read_reply(
                &mut io,
                command,
                if scenario == "refused" {
                    "app_id[LocalApp01.Player] install failed: denied"
                } else {
                    "app_id[LocalApp01.Player] install completed"
                },
            )
            .await;
            read_reply(&mut io, "shell:0 getduid", DUID).await;
            read_reply(
                &mut io,
                "shell:0 vd_applist",
                if scenario == "unverified" {
                    BEFORE
                } else {
                    AFTER
                },
            )
            .await;
            read_reply(&mut io, "shell:0 getduid", DUID).await;
            vec!["written-once".into()]
        })
        .await;
        let connection = TvConnection::with_ports(directory.path().into(), tv.port, 1);
        let result = connection
            .install_local(
                "127.0.0.1",
                &sha256_hex(DUID.as_bytes()),
                path,
                review,
                true,
            )
            .await;
        if scenario == "success" {
            assert_eq!(result.unwrap().version, "1.2.0");
        } else {
            assert_eq!(
                result.unwrap_err().code,
                match scenario {
                    "refused" | "disconnect" => "install_failed",
                    "unverified" => "version_unverified",
                    "stale" => "apps_changed",
                    "identity" => "identity_mismatch",
                    "no-certs" => "certificates_required",
                    _ => unreachable!(),
                },
                "{scenario}"
            );
        }
        assert_eq!(tv.finish().await.len(), 1);
    }
}
#[tokio::test]
async fn unconfirmed_or_changed_local_files_cannot_connect_or_upload() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("Player.wgt");
    widget(&path, config().as_bytes(), None);
    let review = local_widget::inspect(path.clone()).await.unwrap();
    let connection = TvConnection::new(directory.path().into());
    assert_eq!(
        connection
            .install_local(
                "127.0.0.1",
                &sha256_hex(DUID.as_bytes()),
                path.clone(),
                review.clone(),
                false
            )
            .await
            .unwrap_err()
            .code,
        "confirmation_required"
    );
    std::fs::write(&path, b"changed").unwrap();
    assert_eq!(
        connection
            .install_local(
                "127.0.0.1",
                &sha256_hex(DUID.as_bytes()),
                path,
                review,
                true
            )
            .await
            .unwrap_err()
            .code,
        "package_changed"
    );
}
#[test]
fn installation_errors_cannot_be_hidden_by_a_preexisting_matching_version() {
    for reply in [
        "install failed",
        "error: 1009",
        "can not install",
        "app_id[LocalApp01.Player] denied",
    ] {
        assert_eq!(
            verify("LocalApp01.Player", "LocalApp01", "1.2.0", reply, AFTER)
                .unwrap_err()
                .code,
            "install_failed"
        );
    }
    assert!(verify("LocalApp01.Player","LocalApp01","1.2.0","install LocalApp01.Player\npackage_path /tmp/Error.wgt\napp_id[LocalApp01.Player] install completed",AFTER).is_ok());
    assert_eq!(
        verify(
            "LocalApp01.Player",
            "LocalApp01",
            "2.0.0",
            "install completed",
            AFTER
        )
        .unwrap_err()
        .code,
        "version_unverified"
    );
}
