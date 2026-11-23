use super::*;

#[tokio::test]
async fn tv_ownership_is_exclusive_and_drop_releases_the_same_lock_inode() {
    let directory = tempfile::tempdir().unwrap();
    let first = acquire(directory.path(), "192.0.2.20").await.unwrap();
    assert!(acquire(directory.path(), "192.0.2.20").await.is_err());
    assert!(acquire(directory.path(), "192.0.2.21").await.is_ok());
    let path = lock_path(directory.path(), "192.0.2.20");
    assert!(path.is_file());
    drop(first);
    assert!(acquire(directory.path(), "192.0.2.20").await.is_ok());
    assert!(path.is_file());
}
