use serde::{Deserialize, Serialize};
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ButtonMode {
    Default,
    App,
    Disabled,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct TvButtonMapping {
    pub button: String,
    pub mode: ButtonMode,
    pub app_id: Option<String>,
    pub app_name: Option<String>,
    pub active: bool,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ButtonMappings {
    Ready {
        buttons: Vec<TvButtonMapping>,
        discovery_detail: Option<String>,
    },
    PairingRequired,
    HelperUpdateRequired,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct ButtonTargetApp {
    pub id: String,
    pub name: String,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub enum ButtonAssignment {
    App { button: String, app_id: String },
    Default { button: String },
    Disabled { button: String },
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum ButtonInventoryChange {
    Learn { button: String },
    Rename { button: String, new_name: String },
    Reset {},
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ButtonChange {
    Assignment(ButtonAssignment),
    Inventory(ButtonInventoryChange),
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ButtonChangeResult {
    Mapping(TvButtonMapping),
    Inventory(bool),
}
