use super::*;
use serde_json::json;

#[test]
fn rules_override_discovery_with_full_unicode_case_folding_and_sorted_public_fields() {
    let result = mappings(&json!({"rules": [
        {"button":"Straße", "mode":"app", "app_id":"test.Player", "active":true, "private":"secret"},
        {"button":"Netflix", "mode":"default", "app_id":"ignored", "active":true},
        {"button":"Prime Video", "mode":"default", "active":true},
        {"button":"netflix", "mode":"disabled", "active":false}
    ], "discovered":[{"button":"STRASSE"}, {"button":"Disney+"}, {"button":" bad "}, {"button":null}],
    "discovery_detail":" &lt;Ready&gt;\n\u{200b}"}), true).unwrap();
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        json!({"status":"ready", "buttons":[
        {"button":"Disney+", "mode":"default", "app_id":null, "app_name":null, "active":false},
        {"button":"netflix", "mode":"disabled", "app_id":null, "app_name":null, "active":false},
                {"button":"Prime Video", "mode":"default", "app_id":null, "app_name":null, "active":false},
        {"button":"Straße", "mode":"app", "app_id":"test.Player", "app_name":null, "active":true}
    ],"discovery_detail":"<Ready>"})
    );
}

#[test]
fn labels_use_the_helpers_utf16_limit_and_invalid_rules_never_claim_ready() {
    assert!(valid_label(&"😀".repeat(24)));
    assert!(!valid_label(&"😀".repeat(25)));
    for label in ["", " x", "x\n", "x\u{2028}y"] {
        assert!(!valid_label(label));
    }
    for (field, value) in [
        ("button", json!("bad\nname")),
        ("mode", json!("unknown")),
        ("app_id", json!("../bad")),
        ("active", json!(1)),
    ] {
        let mut rule =
            json!({"button":"Netflix", "mode":"app", "app_id":"test.Player", "active":true});
        rule[field] = value;
        assert_eq!(
            mappings(&json!({"rules":[rule]}), true).unwrap_err().code,
            "invalid_response"
        );
    }
    assert!(mappings(&json!({"rules":null}), true).is_err());
    assert_eq!(
        mappings(&json!({"rules":[], "error":"private diagnostic"}), true)
            .unwrap_err()
            .code,
        "button_rules_unreadable"
    );
    let result = mappings(
        &json!({"rules":[],"discovery_detail":"x".repeat(300)}),
        true,
    )
    .unwrap();
    if let ButtonMappings::Ready {
        discovery_detail, ..
    } = result
    {
        assert_eq!(discovery_detail.unwrap().len(), MAX_DETAIL_CHARACTERS);
    }
    let result = mappings(&json!({"rules":[]}), false).unwrap();
    if let ButtonMappings::Ready {
        discovery_detail, ..
    } = result
    {
        assert_eq!(discovery_detail.as_deref(), Some(DISCOVERY_UPDATE_MESSAGE));
    }
}
