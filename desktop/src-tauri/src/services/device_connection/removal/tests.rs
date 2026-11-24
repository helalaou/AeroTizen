use super::*;
use crate::services::{digest::sha256_hex, sdb::tests::serve_script};
use serde_json::{json, Value};
use tokio::{net::TcpListener, time::timeout};

const DUID: &str = "test-duid";
const APPS: &str = "apps count: 3\napp_id=DclHome001.Home app_title=AeroTizen\napp_id=Abcdefghij.Player app_title=Player\napp_id=KLMNOPQRST.Media app_title=Media\n";
const AFTER: &str = "apps count: 2\napp_id=DclHome001.Home app_title=AeroTizen\napp_id=KLMNOPQRST.Media app_title=Media\n";

fn selections(raw: &str, ids: &[&str]) -> Vec<AppPackageSelection> {
    let inventory = projection::checked(raw).unwrap();
    ids.iter()
        .map(|id| {
            let row = inventory.rows.iter().find(|row| row.id == *id).unwrap();
            AppPackageSelection {
                id: id.to_string(),
                revision: row.revision.clone(),
            }
        })
        .collect()
}
fn inventory(steps: &mut Vec<(String, String)>, raw: &str, identity: &str) {
    steps.extend([
        ("shell:0 getduid".into(), DUID.into()),
        ("shell:0 vd_applist".into(), raw.into()),
        ("shell:0 getduid".into(), identity.into()),
    ]);
}
async fn run(
    steps: Vec<(String, String)>,
    selected: Vec<AppPackageSelection>,
) -> (AppResult<AppRemovalResult>, Vec<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let directory = tempfile::tempdir().unwrap();
    let reader = TvConnection::with_ports(
        directory.path().into(),
        listener.local_addr().unwrap().port(),
        1,
    );
    let expected = sha256_hex(DUID.as_bytes());
    let server = async {
        let (mut io, _) = listener.accept().await.unwrap();
        serve_script(&mut io, steps).await
    };
    timeout(Duration::from_secs(3), async {
        tokio::join!(reader.remove("127.0.0.1", &expected, selected), server)
    })
    .await
    .unwrap()
}

#[test]
fn unsafe_duplicate_empty_and_oversized_selections_are_rejected_before_connecting() {
    let valid = selections(APPS, &["Abcdefghij"]);
    assert!(validate(&valid).is_ok());
    let mut cases = vec![
        vec![],
        selections(APPS, &["Abcdefghij", "Abcdefghij"]),
        (0..=MAX_SELECTED_PACKAGES)
            .map(|i| AppPackageSelection {
                id: format!("App{i}"),
                revision: "a".repeat(64),
            })
            .collect(),
    ];
    for id in [
        "bad; command",
        "/tmp/a",
        "bad app",
        "-flag",
        "",
        &"x".repeat(257),
    ] {
        cases.push(vec![AppPackageSelection {
            id: id.into(),
            revision: "a".repeat(64),
        }]);
    }
    for revision in ["bad", "A".repeat(64).as_str()] {
        cases.push(vec![AppPackageSelection {
            id: "App".into(),
            revision: revision.into(),
        }]);
    }
    for selected in cases {
        assert_eq!(validate(&selected).unwrap_err().code, "invalid_request");
    }
}

#[tokio::test]
async fn the_whole_batch_is_checked_before_any_uninstall() {
    for (kind, code) in [
        ("stale", "apps_changed"),
        ("protected", "protected_package"),
        ("identity", "identity_mismatch"),
    ] {
        let mut selected = selections(APPS, &["Abcdefghij", "KLMNOPQRST"]);
        if kind == "stale" {
            selected[1].revision = "0".repeat(64);
        }
        if kind == "protected" {
            selected[1] = selections(APPS, &["DclHome001"]).remove(0);
        }
        let mut steps = Vec::new();
        inventory(
            &mut steps,
            APPS,
            if kind == "identity" { "other-tv" } else { DUID },
        );
        let (result, commands) = run(steps, selected).await;
        assert_eq!(result.unwrap_err().code, code);
        assert!(!commands.iter().any(|s| s.contains("uninstall")));
    }
}

#[tokio::test]
async fn removals_use_app_ids_and_only_verified_inventory_can_report_success() {
    for (reply, status, detail) in [
        ("Can not uninstall app\0\n", "refused", None),
        ("uninstall completed\n", "still_installed", None),
        (
            "Uninstall failed (1009)\n",
            "still_installed",
            Some("Uninstall failed (1009)"),
        ),
    ] {
        let mut steps = Vec::new();
        inventory(&mut steps, APPS, DUID);
        steps.push((
            "shell:0 vd_appuninstall Abcdefghij.Player".into(),
            "Can not uninstall app\n".into(),
        ));
        inventory(&mut steps, AFTER, DUID);
        steps.push((
            "shell:0 vd_appuninstall KLMNOPQRST.Media".into(),
            reply.into(),
        ));
        inventory(&mut steps, AFTER, DUID);
        let (result, commands) = run(steps, selections(APPS, &["Abcdefghij", "KLMNOPQRST"])).await;
        let result = json!(result.unwrap());
        let mut expected = json!({"id":"KLMNOPQRST","status":status});
        if let Some(detail) = detail {
            expected["detail"] = json!(detail);
        }
        assert_eq!(
            result["results"],
            json!([{"id":"Abcdefghij","status":"removed"},expected])
        );
        assert_eq!(result["apps"], json!(projection::packages(AFTER).unwrap()));
        assert_eq!(
            commands.iter().filter(|s| s.contains("uninstall")).count(),
            2
        );
    }
}

#[tokio::test]
async fn incomplete_duplicate_or_changed_identity_reads_stop_the_rest_of_the_batch() {
    for (after, identity) in [
        (
            "apps count: 2\napp_id=DclHome001.Home app_title=AeroTizen\n",
            DUID,
        ),
        ("apps count: 0\n", DUID),
        (
            "apps count: 2\nAbcdefghij.Player\tPlayer\nAbcdefghij.Player\tPlayer\n",
            DUID,
        ),
        (AFTER, "other-tv"),
    ] {
        let mut steps = Vec::new();
        inventory(&mut steps, APPS, DUID);
        steps.push((
            "shell:0 vd_appuninstall Abcdefghij.Player".into(),
            "success".into(),
        ));
        inventory(&mut steps, after, identity);
        let (result, commands) = run(steps, selections(APPS, &["Abcdefghij", "KLMNOPQRST"])).await;
        let result = json!(result.unwrap());
        assert_eq!(result["apps"], Value::Null);
        assert_eq!(
            result["results"],
            json!([{"id":"Abcdefghij","status":"unverified"},{"id":"KLMNOPQRST","status":"not_attempted"}])
        );
        assert_eq!(
            commands.iter().filter(|s| s.contains("uninstall")).count(),
            1
        );
    }
}

#[test]
fn modern_inventory_requires_a_count_and_duplicate_ids_never_pass_verification() {
    for raw in [
        "apps count: 1\n",
        "Error: unavailable",
        "apps count: 2\nAbcdefghij.App\tMedia\nAbcdefghij.App\tMedia\n",
    ] {
        assert!(projection::checked(raw).is_err());
    }
    assert!(projection::checked("apps count: 0\n").is_ok());
}

#[tokio::test]
async fn a_lost_uninstall_reply_is_unverified_and_is_never_replayed() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let directory = tempfile::tempdir().unwrap();
    let reader = TvConnection::with_ports(
        directory.path().into(),
        listener.local_addr().unwrap().port(),
        1,
    );
    let expected = sha256_hex(DUID.as_bytes());
    let mut steps = Vec::new();
    inventory(&mut steps, APPS, DUID);
    let server = async {
        let (mut io, _) = listener.accept().await.unwrap();
        serve_script(&mut io, steps).await;
        let command = crate::services::sdb::tests::next_service(&mut io).await;
        assert_eq!(command, "shell:0 vd_appuninstall Abcdefghij.Player");
        // The TV can close after executing a command. Do not replay an uncertain write.
        drop(io);
    };
    let (result, ()) = timeout(Duration::from_secs(3), async {
        tokio::join!(
            reader.remove(
                "127.0.0.1",
                &expected,
                selections(APPS, &["Abcdefghij", "KLMNOPQRST"])
            ),
            server
        )
    })
    .await
    .unwrap();
    let result = json!(result.unwrap());
    assert_eq!(
        result["results"],
        json!([
            {"id":"Abcdefghij","status":"unverified"},
            {"id":"KLMNOPQRST","status":"not_attempted"}
        ])
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(20), listener.accept())
            .await
            .is_err()
    );
}
