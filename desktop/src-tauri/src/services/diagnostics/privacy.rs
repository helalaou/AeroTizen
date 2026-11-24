//! Re-project device replies and local receipts using the launcher/CLI privacy policy.
use crate::services::home_protocol::{AUTOSTART_KEY, SETTINGS};
use regex::Regex;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::LazyLock};

static SCHEMA: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../../../launcher/src/diagnostics/privacySchema.json"
    ))
    .expect("invalid diagnostic privacy schema")
});
static VERSION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[0-9]{1,3}(\.[0-9]{1,3}){1,3}$").unwrap());
static MODEL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Z]{2,6}[0-9][A-Z0-9_-]{2,80}$").unwrap());
static PLATFORM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Z0-9][A-Z0-9_.-]{1,127}$").unwrap());
static BUILD_ID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[a-f0-9]{40,64}$").unwrap());
static APP_ALIAS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^app-[0-9]{1,10}$").unwrap());
static STACK_LOCATION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^|[/\\])([a-zA-Z0-9_-]+\.(?:js|html|py)):([0-9]{1,10})(?::([0-9]{1,10}))?")
        .unwrap()
});
static HTTP_REASON: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^HomeWatcher HTTP [1-5][0-9]{2}$").unwrap());

const MAX_REFERENCE_BYTES: usize = 256;
const MAX_NUMBER: f64 = 10_000_000_000_000_000.0;
const MAX_TV_RECORDS: usize = 400;
const EVENT_FIELDS: &[&str] = &[
    "action",
    "mode",
    "operation",
    "app_id",
    "error",
    "reason",
    "status",
    "phase",
    "line",
    "component",
    "version",
    "hidden",
    "operation_id",
    "message",
    "file",
    "column",
    "stack",
    "code",
    "build_id",
    "commit",
    "dirty",
];

fn allowed(set: &Value, value: &Value) -> bool {
    set.as_array().is_some_and(|values| values.contains(value))
}

fn matches(value: &Value, regex: &Regex) -> bool {
    value
        .as_str()
        .is_some_and(|text| text.len() <= MAX_REFERENCE_BYTES && regex.is_match(text))
}

fn number(value: &Value) -> Value {
    value
        .as_f64()
        .filter(|v| (0.0..=MAX_NUMBER).contains(v))
        .map_or(Value::Null, |_| value.clone())
}

pub(super) fn error_code(value: &Value) -> &'static str {
    let text: String = value
        .as_str()
        .unwrap_or_default()
        .chars()
        .take(1024)
        .collect();
    let text = text.to_ascii_lowercase();
    for (message, code) in [
        ("final home readback failed", "final_home_readback_failed"),
        (
            "home operation readback failed",
            "home_operation_readback_failed",
        ),
        ("setting readback failed", "setting_readback_failed"),
        ("setting write failed", "setting_write_failed"),
        ("autostart readback failed", "autostart_readback_failed"),
        ("autostart write failed", "autostart_write_failed"),
        ("native boot readback failed", "native_boot_readback_failed"),
        ("rollback incomplete", "rollback_incomplete"),
        ("cannot read", "property_access_failed"),
        ("is not defined", "reference_unavailable"),
        ("unexpected token", "invalid_syntax"),
        ("launch denied", "launch_denied"),
        ("launch failed", "launch_failed"),
    ] {
        if text == code || text.contains(message) {
            return code;
        }
    }
    "detail_omitted"
}

fn source_file(value: &str) -> Option<&str> {
    let file = value.split(['?', '#']).next()?.rsplit(['/', '\\']).next()?;
    allowed(&SCHEMA["source_files"], &json!(file)).then_some(file)
}

fn stack(value: &Value) -> String {
    let collect = |lines: &mut dyn Iterator<Item = &str>| {
        lines
            .take(32)
            .filter_map(|line| {
                let bounded: String = line.chars().take(1024).collect();
                let location = STACK_LOCATION.captures(&bounded)?;
                let file = source_file(location.get(1)?.as_str())?;
                let line = location.get(2)?.as_str();
                Some(match location.get(3) {
                    Some(column) => format!("{file}:{line}:{}", column.as_str()),
                    None => format!("{file}:{line}"),
                })
            })
            .take(8)
            .collect::<Vec<_>>()
            .join("\n")
    };
    if let Some(lines) = value.as_array() {
        collect(&mut lines.iter().filter_map(Value::as_str))
    } else {
        collect(&mut value.as_str().unwrap_or_default().lines())
    }
}

#[derive(Default)]
pub(super) struct Privacy {
    aliases: HashMap<(&'static str, String), String>,
}

impl Privacy {
    fn alias(&mut self, value: &Value, kind: &'static str) -> Value {
        let Some(id) = value.as_str().filter(|id| id.len() <= MAX_REFERENCE_BYTES) else {
            return Value::Null;
        };
        let next = self.aliases.len() + 1;
        json!(self
            .aliases
            .entry((kind, id.to_owned()))
            .or_insert_with(|| format!("{kind}-{next}")))
    }

    pub fn app(&mut self, value: &Value) -> Value {
        if allowed(&SCHEMA["app_ids"], value) || matches(value, &APP_ALIAS) {
            value.clone()
        } else {
            self.alias(value, "app")
        }
    }

    pub fn value(&mut self, field: &str, value: &Value) -> Value {
        if value.is_null() {
            return Value::Null;
        }
        let field_value = json!(field);
        if allowed(&SCHEMA["bools"], &field_value) {
            return value.as_bool().map_or(Value::Null, Value::from);
        }
        if allowed(&SCHEMA["numbers"], &field_value) {
            return number(value);
        }
        if let Some(values) = SCHEMA["enums"].get(field) {
            return if allowed(values, value) {
                value.clone()
            } else {
                Value::Null
            };
        }
        match field {
            "app_id" => self.app(value),
            "id" | "session" | "operation_id" => self.alias(value, "ref"),
            "error" | "error_type" if allowed(&SCHEMA["errors"], value) => value.clone(),
            "error" | "error_type" => json!("Error"),
            "message" => json!(error_code(value)),
            "reason" => {
                let reason = value.as_str().unwrap_or_default();
                if allowed(&SCHEMA["reasons"], value)
                    || matches(value, &HTTP_REASON)
                    || matches!(
                        reason,
                        "Art status: on"
                            | "Art status: off"
                            | "Art status: unknown"
                            | "fresh Art status: on"
                            | "fresh Art status: off"
                            | "fresh Art status: unknown"
                    )
                {
                    value.clone()
                } else if reason.starts_with("home pressed in ") {
                    json!("home_pressed_in_app")
                } else {
                    json!(error_code(value))
                }
            }
            "operation"
                if value
                    .as_str()
                    .and_then(|operation| {
                        operation.strip_prefix("http://tizen.org/appcontrol/operation/")
                    })
                    .is_some_and(|operation| {
                        matches!(operation, "main" | "default" | "view" | "service")
                    }) =>
            {
                value.clone()
            }
            "file" => json!(value
                .as_str()
                .and_then(source_file)
                .unwrap_or("[unknown source]")),
            "stack" => json!(stack(value)),
            "version" | "tizen" | "os_version" if matches(value, &VERSION) => value.clone(),
            "build_id" | "commit" if matches(value, &BUILD_ID) => value.clone(),
            "firmware" | "firmware_build" | "platform"
                if matches(value, &PLATFORM)
                    && value
                        .as_str()
                        .is_some_and(|s| s.bytes().any(|b| b.is_ascii_digit())) =>
            {
                value.clone()
            }
            "model" if matches(value, &MODEL) => value.clone(),
            "created_at" | "queried_at" | "at_text" => value
                .as_str()
                .filter(|s| s.len() <= 40)
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map_or(Value::Null, |time| json!(time.to_rfc3339())),
            _ => Value::Null,
        }
    }

    pub fn fields(&mut self, value: &Value, keys: &[&str]) -> Value {
        Value::Object(
            keys.iter()
                .filter_map(|&key| {
                    value
                        .get(key)
                        .map(|item| (key.to_owned(), self.value(key, item)))
                })
                .collect(),
        )
    }

    fn section(&mut self, value: &Value, section: &str) -> Value {
        let keys: &[&str] = match section {
            "build" => &["version", "build_id", "commit", "dirty"],
            "health" => &[
                "session",
                "buffered",
                "discarded",
                "invalid",
                "pending_errors",
                "storage",
                "unsaved",
                "saving",
                "writes",
                "write_failures",
                "read_failures",
                "clock",
            ],
            "environment" => &["state", "tizen", "firmware", "arch", "reason"],
            "context" => &[
                "mode",
                "persistent",
                "protocol",
                "watcher_heartbeats",
                "watcher_launch_calls",
            ],
            "ui" => &["version", "queued", "reported_at"],
            "delivery" => &["state", "retries", "last_status"],
            _ => unreachable!(),
        };
        let mut result = self.fields(value, keys);
        if section == "context" {
            result["native_settings"] = json!("not_queried");
        }
        if section == "ui" {
            for key in ["health", "build", "delivery"] {
                if value[key].is_object() {
                    result[key] = self.section(&value[key], key);
                }
            }
        }
        result
    }

    pub fn tv_logs(&mut self, data: &Value) -> Option<Value> {
        if data["schema_version"].as_u64() != Some(1) {
            return None;
        }
        let records = data["records"].as_array()?;
        if records.len() > MAX_TV_RECORDS
            || records
                .iter()
                .any(|record| !matches!(record["source"].as_str(), Some("ui" | "service")))
        {
            return None;
        }
        let records: Vec<_> = records
            .iter()
            .map(|record| {
                let mut entry =
                    self.fields(record, &["id", "at", "session", "sequence", "elapsed_ms"]);
                entry["source"] = record["source"].clone();
                let event = &record["event"];
                if allowed(&SCHEMA["events"], event) && event != "diagnostic.unknown" {
                    entry["event"] = event.clone();
                    entry["data"] = self.fields(&record["data"], EVENT_FIELDS);
                } else {
                    entry["event"] = json!("diagnostic.unknown");
                    entry["data"] = json!({});
                }
                entry
            })
            .collect();
        let mut result = json!({"schema_version": 1, "records": records});
        for key in ["build", "health", "environment", "context", "ui"] {
            if data[key].is_object() {
                result[key] = self.section(&data[key], key);
            }
        }
        Some(result)
    }

    fn snapshot(&mut self, value: &Value) -> Value {
        if !value.is_object() {
            return Value::Null;
        }
        let mut strings = json!({});
        for (key, kind) in SETTINGS {
            if kind == "string" {
                strings[key] = self.app(&value["Strings"][key]);
            }
        }
        json!({"Main": self.app(&value["Main"]), "Strings": strings, "AutoStart": number(&value["AutoStart"])})
    }

    fn native_result(&mut self, value: &Value) -> Value {
        if !value.is_object() {
            return Value::Null;
        }
        let mut result = self.fields(value, &["Success", "RolledBack"]);
        if let Some(restored) = value["StartupSettingsRestored"].as_bool() {
            result["StartupSettingsRestored"] = json!(restored);
        }
        if value.get("Error").is_some() {
            result["Error"] = if value["Error"].as_str().is_some_and(|text| !text.is_empty()) {
                json!(error_code(&value["Error"]))
            } else {
                Value::Null
            };
        }
        if value.get("After").is_some() {
            result["After"] = self.snapshot(&value["After"]);
        }
        let watcher = &value["Watcher"];
        if watcher.is_object() {
            result["Watcher"] = json!({
                "Mode": self.value("mode", &watcher["Mode"]),
                "Protocol": number(&watcher["Protocol"]),
                "Persistent": self.value("persistent", &watcher["Persistent"])
            });
        }
        let failure = &value["Failure"];
        if failure.is_object() {
            let mut differences = json!({});
            for key in std::iter::once("operation/main").chain(SETTINGS.map(|(key, _)| key)) {
                let pair = &failure["Differences"][key];
                if pair.is_object() {
                    let mut setting = json!({});
                    for name in ["Expected", "Observed"] {
                        setting[name] = if key == AUTOSTART_KEY {
                            number(&pair[name])
                        } else {
                            self.app(&pair[name])
                        };
                    }
                    differences[key] = setting;
                }
            }
            result["Failure"] = json!({
                "Phase": self.value("phase", &failure["Phase"]),
                "Expected": self.snapshot(&failure["Expected"]),
                "Observed": self.snapshot(&failure["Observed"]),
                "Differences": differences
            });
        }
        result
    }

    pub fn receipt(&mut self, value: &Value) -> Value {
        let state = match value["state"].as_str() {
            Some("applied_verified") => json!("applied_verified"),
            Some("restored_verified") => json!("restored_verified"),
            _ => self.value("state", &value["state"]),
        };
        json!({
            "created_at": self.value("created_at", &value["created_at"]),
            "state": state,
            "command": self.fields(&value["request"], &["action", "boot", "firmware"]),
            "native_result": self.native_result(&value["native_result"]),
            "error_code": value["error"].is_string().then(|| error_code(&value["error"])),
        })
    }
}
