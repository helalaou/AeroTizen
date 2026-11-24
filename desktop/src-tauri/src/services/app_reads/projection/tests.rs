use super::*;
use serde_json::{json, Value};

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../../tests/fixtures/app-inventory.json"
    ))
    .unwrap()
}

#[test]
fn public_inventory_matches_the_python_packages_protection_names_and_revision_contract() {
    let fixture = fixture();
    for case in fixture["cases"].as_array().unwrap() {
        let raw = case["raw"].as_str().unwrap();
        if let Some(error) = case["error"].as_str() {
            assert_eq!(packages(raw).unwrap_err().code, error, "{}", case["name"]);
            assert_eq!(targets(raw).unwrap_err().code, error, "{}", case["name"]);
        } else {
            assert_eq!(
                json!(packages(raw).unwrap()),
                case["packages"],
                "{}",
                case["name"]
            );
            assert_eq!(
                json!(targets(raw).unwrap()),
                case["targets"],
                "{}",
                case["name"]
            );
        }
    }
    let mut ids = PROTECTED_PACKAGES.to_vec();
    ids.sort();
    assert_eq!(json!(ids), fixture["protected_packages"]);
    assert_eq!(json!(PROTECTED_HINTS), fixture["protected_hints"]);
}

#[test]
fn row_and_field_limits_reject_oversized_inventories_before_projection() {
    assert_eq!(
        packages(&"ExampleApp.App\tMedia\n".repeat(MAX_APPS + 1))
            .unwrap_err()
            .code,
        "invalid_response"
    );
    let fields = "field=value ".repeat(MAX_FIELDS + 1);
    assert!(targets(&fields).is_err());
}
