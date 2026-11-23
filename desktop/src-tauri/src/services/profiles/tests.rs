use super::*;

fn tv(host: &str) -> VerifiedTv {
    VerifiedTv {
        host: host.into(),
        ..serde_json::from_str(include_str!("../../models/fixtures/verified-tv.json")).unwrap()
    }
}

#[tokio::test]
async fn reconnect_keeps_name_and_updates_address_without_a_duplicate() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("profiles.sqlite3");
    let store = Profiles::new(path.clone()).unwrap();
    let first = store.save(tv("192.0.2.20")).await.unwrap();
    store.rename(&first.id, "Living room").await.unwrap();
    store.save(tv("192.0.2.21")).await.unwrap();
    let reopened = Profiles::new(path).unwrap();
    let saved = reopened.list().await.unwrap();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].tv.host, "192.0.2.21");
    assert_eq!(saved[0].tv.name, "Living room");
    reopened.forget(&first.id).await.unwrap();
    assert!(reopened.list().await.unwrap().is_empty());
}

#[tokio::test]
async fn invalid_identity_or_name_does_not_change_profiles() {
    let directory = tempfile::tempdir().unwrap();
    let store = Profiles::new(directory.path().join("profiles.sqlite3")).unwrap();
    let saved = store.save(tv("192.0.2.20")).await.unwrap();
    assert!(store.rename(&saved.id, "\n").await.is_err());
    let invalid = VerifiedTv {
        identity_sha256: "invalid".into(),
        ..tv("192.0.2.30")
    };
    assert!(store.save(invalid).await.is_err());
    assert_eq!(store.get(&saved.id).await.unwrap().tv.host, "192.0.2.20");
}

#[tokio::test]
async fn locked_database_does_not_block_the_async_executor() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("profiles.sqlite3");
    let store = Profiles::new(path.clone()).unwrap();
    let locked = Connection::open(path).unwrap();
    locked.execute_batch("BEGIN EXCLUSIVE").unwrap();
    let read = store.list();
    tokio::pin!(read);
    tokio::select! {
        biased;
        result = &mut read => panic!("profile read blocked the executor instead of yielding: {result:?}"),
        _ = tokio::task::yield_now() => {}
    }
    locked.execute_batch("ROLLBACK").unwrap();
    assert!(read.await.unwrap().is_empty());
}
