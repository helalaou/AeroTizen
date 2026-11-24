use super::*;
#[test]
fn root_setup_requires_developer_mode_and_a_normal_unicast_host_address() {
    assert_eq!(
        source(&json!({"developerMode":"1","developerIP":"192.0.2.10"})).unwrap(),
        Ipv4Addr::new(192, 0, 2, 10)
    );
    for ip in [
        "127.0.0.1",
        "0.0.0.0",
        "255.255.255.255",
        "224.0.0.1",
        "bad",
    ] {
        assert_eq!(
            source(&json!({"developerMode":"1","developerIP":ip}))
                .unwrap_err()
                .code,
            "root_requirements"
        );
    }
    assert!(source(&json!({"developerMode":"0","developerIP":"192.0.2.10"})).is_err());
}
#[test]
fn root_sdk_records_require_one_successful_result_without_exposing_private_output() {
    let completion = sdk::Completion {
        stdout: format!("{RPC_PREFLIGHT}{{\"schema_version\":1}}\n"),
        exit_code: 0,
        staging_cleaned: true,
    };
    assert_eq!(
        parse(completion, RPC_PREFLIGHT).unwrap()["schema_version"],
        1
    );
    let failure = sdk::Completion {
        stdout: "private-token private-pfx".into(),
        exit_code: 1,
        staging_cleaned: true,
    };
    let error = parse(failure, RPC_PREFLIGHT).unwrap_err();
    assert!(!error.message.contains("private-token"));
}
