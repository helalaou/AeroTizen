use super::*;
use crate::models::{ButtonMode, TvButtonMapping};

fn mappings(id: &str) -> ButtonMappings {
    ButtonMappings::Ready {
        buttons: vec![TvButtonMapping {
            button: "Netflix".into(),
            mode: ButtonMode::App,
            app_id: Some(id.into()),
            app_name: None,
            active: true,
        }],
        discovery_detail: None,
    }
}

#[tokio::test]
async fn app_names_remain_optional_but_identity_errors_are_not_hidden() {
    let named = with_app_names(mappings("test.Player"), || async {
        Ok(vec![ButtonTargetApp {
            id: "test.Player".into(),
            name: "Player".into(),
        }])
    })
    .await
    .unwrap();
    let ButtonMappings::Ready { buttons, .. } = named else {
        panic!()
    };
    assert_eq!(buttons[0].app_name.as_deref(), Some("Player"));
    let unnamed = with_app_names(mappings("test.Player"), || async {
        Err(AppError::new("connection_failed", "private"))
    })
    .await
    .unwrap();
    let ButtonMappings::Ready { buttons, .. } = unnamed else {
        panic!()
    };
    assert!(buttons[0].app_name.is_none());
    let error = with_app_names(mappings("test.Player"), || async {
        Err(AppError::new("identity_mismatch", "wrong TV"))
    })
    .await
    .unwrap_err();
    assert_eq!(error.code, "identity_mismatch");
    let launcher = with_app_names(mappings(LAUNCHER_APP_ID), || async {
        panic!("launcher name needs no worker")
    })
    .await
    .unwrap();
    let ButtonMappings::Ready { buttons, .. } = launcher else {
        panic!()
    };
    assert_eq!(buttons[0].app_name.as_deref(), Some("AeroTizen"));
}
