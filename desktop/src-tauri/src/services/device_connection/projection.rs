use crate::{
    models::{AppError, AppResult, ButtonTargetApp, TvAppPackage},
    services::{
        button_rules::valid_app_id,
        digest::sha256_hex,
        text::{case_fold, display_text, python_whitespace},
    },
};
use regex::Regex;
use std::{
    collections::{HashMap, HashSet},
    fmt::Write,
    sync::OnceLock,
};
use unicode_general_category::{get_general_category, GeneralCategory};

const MAX_APPS: usize = 4096;
const MAX_FIELDS: usize = 256;
const MAX_TEXT_CHARACTERS: usize = 256;
const STORE_PACKAGE_CHARACTERS: usize = 10;
const PROTECTED_PACKAGES: [&str; 7] = [
    "ZODRT12q2l",
    "aQjWjLsPaO",
    "30IKH0OX8U",
    "DclHome001",
    super::root_bridge::HELPER_APP_ID,
    "com.samsung.tv.SecurityCenter",
    "org.tizen.browser",
];
const PROTECTED_HINTS: [&str; 5] = [
    "lowmem",
    "webaccount",
    "multiscreen",
    "adplayer",
    "launcher",
];

struct App {
    id: String,
    package: String,
    name: String,
    version: Option<String>,
    removable: Option<bool>,
}

fn invalid() -> AppError {
    AppError::new(
        "invalid_response",
        "The TV returned an unsupported response.",
    )
}
fn trim(value: &str) -> &str {
    value.trim_matches(python_whitespace)
}
fn word(character: char) -> bool {
    character == '_'
        || matches!(
            get_general_category(character),
            GeneralCategory::UppercaseLetter
                | GeneralCategory::LowercaseLetter
                | GeneralCategory::TitlecaseLetter
                | GeneralCategory::ModifierLetter
                | GeneralCategory::OtherLetter
                | GeneralCategory::DecimalNumber
                | GeneralCategory::LetterNumber
                | GeneralCategory::OtherNumber
        )
}

fn integer(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    let value = value.strip_prefix(['+', '-']).unwrap_or(value);
    let mut previous_digit = false;
    for ch in value.chars() {
        if get_general_category(ch) == GeneralCategory::DecimalNumber {
            previous_digit = true;
        } else if ch == '_' && previous_digit {
            previous_digit = false;
        } else {
            return false;
        }
    }
    previous_digit
}

fn blocks(raw: &str) -> AppResult<Vec<App>> {
    static SEPARATOR: OnceLock<Regex> = OnceLock::new();
    static FIELD: OnceLock<Regex> = OnceLock::new();
    let separator =
        SEPARATOR.get_or_init(|| Regex::new(r"\n-{20,}\s*\n").expect("constant app separator"));
    let pattern = FIELD.get_or_init(|| {
        Regex::new(r"(?m)-{3,}([\w():,]+?)\s*=(.*?)-{5,}\s*$").expect("constant app field")
    });
    let mut apps = Vec::new();
    for block in separator.split(raw) {
        let mut fields = HashMap::new();
        for (index, capture) in pattern.captures_iter(block).enumerate() {
            if index == MAX_FIELDS {
                return Err(invalid());
            }
            fields.insert(
                trim(capture.get(1).unwrap().as_str()),
                trim(capture.get(2).unwrap().as_str()),
            );
        }
        let Some(store_id) = fields.get("app_id") else {
            continue;
        };
        if !["app_size", "use_count"]
            .iter()
            .all(|key| integer(fields.get(key).copied().unwrap_or_default()))
        {
            return Err(invalid());
        }
        let id = fields
            .get("app_tizen_id")
            .copied()
            .filter(|id| !id.is_empty())
            .unwrap_or(store_id);
        apps.push(App {
            id: id.into(),
            package: fields
                .get("app_package_name")
                .copied()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| id.split('.').next().unwrap_or_default())
                .into(),
            name: fields
                .get("app_title")
                .copied()
                .filter(|s| !s.is_empty())
                .unwrap_or(id)
                .into(),
            version: fields
                .get("app_version")
                .filter(|s| !s.is_empty())
                .map(|s| (*s).into()),
            removable: Some(fields.get("is_removable") == Some(&"1")),
        });
        if apps.len() > MAX_APPS {
            return Err(invalid());
        }
    }
    Ok(apps)
}

fn line_fields(line: &str) -> AppResult<HashMap<&str, &str>> {
    static PREFIX: OnceLock<Regex> = OnceLock::new();
    let pattern =
        PREFIX.get_or_init(|| Regex::new(r"(\w+)\s*[=:]\s*\[?").expect("constant app prefix"));
    let prefixes: Vec<_> = pattern.captures_iter(line).take(MAX_FIELDS + 1).collect();
    if prefixes.len() > MAX_FIELDS {
        return Err(invalid());
    }
    let mut fields = HashMap::new();
    let mut consumed = 0;
    for (index, capture) in prefixes.iter().enumerate() {
        let whole = capture.get(0).unwrap();
        if whole.start() < consumed {
            continue;
        }
        let start = whole.end();
        let next = prefixes[index + 1..]
            .iter()
            .filter_map(|next| next.get(0))
            .find(|next| {
                line[..next.start()]
                    .chars()
                    .next_back()
                    .is_some_and(python_whitespace)
            })
            .map_or(line.len(), |next| next.start());
        let value = &line[start..next];
        let end = value.find([']', '\t', ',']).unwrap_or(value.len());
        let raw = &value[..end];
        if raw.is_empty() {
            continue;
        }
        if value.as_bytes().get(end) == Some(&b']')
            && !trim(&value[end + 1..]).is_empty()
            && !value[end + 1..].starts_with(['\t', ','])
        {
            continue;
        }
        fields.insert(
            capture.get(1).unwrap().as_str(),
            raw.trim_end_matches(python_whitespace),
        );
        consumed = start + end;
    }
    Ok(fields)
}

fn legacy(raw: &str) -> AppResult<Vec<App>> {
    static COLUMNS: OnceLock<Regex> = OnceLock::new();
    let columns = COLUMNS.get_or_init(|| Regex::new(r"\t+|\s{2,}").expect("constant app columns"));
    let mut apps = Vec::new();
    for line in raw
        .split([
            '\n', '\r', '\u{b}', '\u{c}', '\u{1c}', '\u{1d}', '\u{1e}', '\u{85}', '\u{2028}',
            '\u{2029}',
        ])
        .map(trim)
    {
        if line.is_empty()
            || line.starts_with(['#', '='])
            || line.starts_with("---")
            || line.to_lowercase().starts_with("total")
        {
            continue;
        }
        let fields = line_fields(line)?;
        let mut parts = columns.split(line);
        let explicit = ["app_tizen_id", "appid", "app_id", "id"]
            .iter()
            .find_map(|key| fields.get(key).copied().filter(|s| !s.is_empty()));
        let (id, fallback_name) = if let Some(id) = explicit {
            (id, None)
        } else {
            (parts.next().unwrap_or_default(), parts.next())
        };
        let id = trim(id);
        if id.is_empty() || !id.chars().all(|c| word(c) || matches!(c, '.' | '-')) {
            continue;
        }
        let name = ["app_title", "name", "title"]
            .iter()
            .find_map(|key| fields.get(key).copied().filter(|s| !s.is_empty()))
            .or(fallback_name)
            .unwrap_or(id);
        apps.push(App {
            id: id.into(),
            package: id.split('.').next().unwrap_or_default().into(),
            name: trim(name).into(),
            version: fields
                .get("app_version")
                .filter(|s| !s.is_empty())
                .map(|s| (*s).into()),
            removable: None,
        });
        if apps.len() > MAX_APPS {
            return Err(invalid());
        }
    }
    Ok(apps)
}

fn parse(raw: &str) -> AppResult<Vec<App>> {
    if raw.contains("app_tizen_id") {
        blocks(raw)
    } else {
        legacy(raw)
    }
}

pub(crate) fn protected_package(id: &str) -> bool {
    PROTECTED_PACKAGES.contains(&id)
}

fn protected(app: &App) -> bool {
    if protected_package(&app.package) {
        return true;
    }
    match app.removable {
        Some(false) => return true,
        None if app.package.len() != STORE_PACKAGE_CHARACTERS
            || !app.package.bytes().all(|b| b.is_ascii_alphanumeric()) =>
        {
            return true
        }
        _ => {}
    }
    let name = app.name.to_lowercase();
    let id = app.id.to_lowercase();
    PROTECTED_HINTS
        .iter()
        .any(|hint| name.contains(hint) || id.contains(hint))
}

fn display(value: &str, fallback: &str) -> String {
    display_text(
        Some(&serde_json::Value::String(value.into())),
        MAX_TEXT_CHARACTERS,
    )
    .unwrap_or_else(|| fallback.into())
}

fn json_string(output: &mut String, value: &str) {
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{8}' => output.push_str("\\b"),
            '\u{c}' => output.push_str("\\f"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            ' '..='~' => output.push(character),
            _ => {
                let mut units = [0; 2];
                for unit in character.encode_utf16(&mut units) {
                    write!(output, "\\u{unit:04x}").expect("writing a String");
                }
            }
        }
    }
    output.push('"');
}

fn revision(apps: &[App]) -> String {
    let mut values: Vec<_> = apps
        .iter()
        .map(|app| {
            (
                app.id.as_str(),
                app.name.as_str(),
                app.version.as_deref().unwrap_or_default(),
            )
        })
        .collect();
    values.sort();
    let mut encoded = String::from("[");
    for (index, (id, name, version)) in values.into_iter().enumerate() {
        if index != 0 {
            encoded.push(',');
        }
        encoded.push('[');
        for (index, value) in [id, name, version].into_iter().enumerate() {
            if index != 0 {
                encoded.push(',');
            }
            json_string(&mut encoded, value);
        }
        encoded.push(']');
    }
    encoded.push(']');
    sha256_hex(encoded.as_bytes())
}

pub(super) fn packages(raw: &str) -> AppResult<Vec<TvAppPackage>> {
    project_packages(parse(raw)?)
}

fn project_packages(apps: Vec<App>) -> AppResult<Vec<TvAppPackage>> {
    let mut groups: Vec<Vec<App>> = Vec::new();
    let mut positions = HashMap::new();
    for app in apps {
        let index = *positions.entry(app.package.clone()).or_insert_with(|| {
            groups.push(Vec::new());
            groups.len() - 1
        });
        groups[index].push(app);
    }
    let mut output = Vec::new();
    for apps in groups {
        let representative = apps
            .iter()
            .min_by_key(|app| app.name.chars().count())
            .ok_or_else(invalid)?;
        let mut seen = HashSet::new();
        output.push(TvAppPackage {
            id: representative.package.clone(),
            name: display(&representative.name, "Unknown"),
            apps: apps
                .iter()
                .map(|app| display(&app.name, "Unknown"))
                .filter(|name| seen.insert(name.clone()))
                .collect(),
            protected: apps.iter().any(protected),
            revision: revision(&apps),
        });
    }
    output.sort_by_key(|app| case_fold(&app.name));
    Ok(output)
}

pub(super) fn targets(raw: &str) -> AppResult<Vec<ButtonTargetApp>> {
    let mut names = HashMap::new();
    for app in parse(raw)? {
        if valid_app_id(&app.id) {
            names.insert(app.id.clone(), display(&app.name, &app.id));
        }
    }
    let mut output: Vec<_> = names
        .into_iter()
        .map(|(id, name)| ButtonTargetApp { id, name })
        .collect();
    output.sort_by(|a, b| {
        case_fold(&a.name)
            .cmp(&case_fold(&b.name))
            .then(a.id.cmp(&b.id))
    });
    Ok(output)
}

#[cfg(test)]
mod tests;

pub(super) struct Inventory {
    pub rows: Vec<TvAppPackage>,
    first_apps: HashMap<String, String>,
}

impl Inventory {
    pub fn removal_target(&self, id: &str, revision: &str) -> AppResult<&str> {
        let row = self
            .rows
            .iter()
            .find(|row| row.id == id && row.revision == revision)
            .ok_or_else(|| {
                AppError::new(
                    "apps_changed",
                    "The app list changed. Refresh the TV and review your selection again.",
                )
            })?;
        if row.protected {
            return Err(AppError::new(
                "protected_package",
                "The selection includes a protected package.",
            ));
        }
        self.first_apps
            .get(id)
            .map(String::as_str)
            .filter(|id| super::sdb::valid_identifier(id))
            .ok_or_else(|| {
                AppError::new(
                    "invalid_app_id",
                    "The TV reported an unsupported app identifier.",
                )
            })
    }
}

pub(super) fn checked(raw: &str) -> AppResult<Inventory> {
    static HEADER: OnceLock<Regex> = OnceLock::new();
    static ERROR: OnceLock<Regex> = OnceLock::new();
    let header = HEADER.get_or_init(|| Regex::new(r"(?im)^\s*apps count\s*:\s*(\d+)\s*$").unwrap());
    let error = ERROR.get_or_init(|| {
        Regex::new(r"(?i)^\s*(?:error|fail(?:ed|ure)?|permission denied)\b").unwrap()
    });
    let apps = parse(raw)?;
    let unique: HashSet<_> = apps.iter().map(|app| app.id.as_str()).collect();
    let complete = match header.captures(raw) {
        Some(count) => count[1].parse::<usize>().ok() == Some(apps.len()),
        None => !apps.is_empty() && !raw.contains("app_tizen_id") && !error.is_match(raw),
    };
    if !complete || unique.len() != apps.len() {
        return Err(AppError::new(
            "inventory_unavailable",
            "Could not verify the TV's app list. Refresh the TV and try again.",
        ));
    }
    let mut first_apps = HashMap::new();
    for app in &apps {
        first_apps
            .entry(app.package.clone())
            .or_insert_with(|| app.id.clone());
    }
    Ok(Inventory {
        rows: project_packages(apps)?,
        first_apps,
    })
}

pub(super) fn installed(
    raw: &str,
    package_id: &str,
    app_id: &str,
) -> AppResult<(Option<String>, Option<String>)> {
    let inventory = checked(raw)?;
    let row = inventory.rows.into_iter().find(|row| row.id == package_id);
    let Some(row) = row else {
        return Ok((None, None));
    };
    let version = parse(raw)?
        .into_iter()
        .find(|app| app.package == package_id && app.id == app_id)
        .and_then(|app| app.version)
        .and_then(|value| {
            display_text(Some(&serde_json::Value::String(value)), MAX_TEXT_CHARACTERS)
        });
    Ok((Some(row.revision), version))
}

pub(super) fn launcher(raw: &str) -> AppResult<Option<String>> {
    let mut apps = parse(raw)?
        .into_iter()
        .filter(|app| app.id == crate::models::LAUNCHER_APP_ID);
    let Some(app) = apps.next() else {
        return Ok(None);
    };
    if app.package != crate::models::LAUNCHER_APP_ID.split('.').next().unwrap()
        || apps.next().is_some()
    {
        return Err(AppError::new(
            "unexpected_package",
            "The TV reported an unexpected launcher package.",
        ));
    }
    Ok(Some(
        app.version
            .map(|value| display(&value, "Unknown"))
            .unwrap_or_else(|| "Unknown".into()),
    ))
}
