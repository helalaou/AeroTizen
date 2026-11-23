use crate::models::ReleaseSection;
use crate::services::text::python_whitespace;
use regex::Regex;
use std::sync::LazyLock;

const MAX_BODY_CHARACTERS: usize = 8_000;
const MIN_HEADING_MARKERS: usize = 3;
const MAX_HEADING_MARKERS: usize = 6;
static CHANGE_REFERENCE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i)[\s\x1c-\x1f]*\(\[[^\]]+\]\(https://github\.com/[^)]+\)\)",
        r"|,?[\s\x1c-\x1f]+(?:closes|fixes|resolves)[\s\x1c-\x1f]+",
        r"\[#[0-9]+\]\(https://github\.com/[^)]+\).*$"
    ))
    .expect("valid change-reference expression")
});
static COMPONENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\*\*[^*]+:\*\*[\s\x1c-\x1f]*").expect("valid component expression")
});
static LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\([^)]+\)").expect("valid link expression"));
static DECORATION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\*\*([^*]+)\*\*|`([^`]+)`").expect("valid decoration expression")
});

fn spaced_content(value: &str) -> Option<&str> {
    value
        .chars()
        .next()
        .filter(|character| python_whitespace(*character))?;
    let value = value.trim_start_matches(python_whitespace);
    (!value.is_empty()).then_some(value)
}

fn heading(line: &str) -> Option<&str> {
    let markers = line.bytes().take_while(|byte| *byte == b'#').count();
    if !(MIN_HEADING_MARKERS..=MAX_HEADING_MARKERS).contains(&markers) {
        return None;
    }
    spaced_content(&line[markers..])
}

pub(super) fn sections(body: Option<&str>) -> Vec<ReleaseSection> {
    let Some(body) = body else { return Vec::new() };
    let body: String = body.chars().take(MAX_BODY_CHARACTERS).collect();
    let mut sections = Vec::new();
    let mut current_heading = None;
    let mut changes = Vec::new();
    // Python splitlines also recognizes these Unicode and ASCII line separators.
    for line in body.split([
        '\r', '\n', '\u{b}', '\u{c}', '\u{1c}', '\u{1d}', '\u{1e}', '\u{85}', '\u{2028}',
        '\u{2029}',
    ]) {
        let line = line.trim_matches(python_whitespace);
        if let Some(value) = heading(line) {
            if !changes.is_empty() {
                sections.push(ReleaseSection {
                    heading: current_heading.take(),
                    changes: std::mem::take(&mut changes),
                });
            }
            current_heading = Some(value.to_owned());
        } else if let Some(bullet) = line.strip_prefix(['*', '+', '-']).and_then(spaced_content) {
            let change = CHANGE_REFERENCE.replace_all(bullet, "");
            let change = COMPONENT.replace(&change, "");
            let change = LINK.replace_all(&change, "$1");
            let change = DECORATION.replace_all(&change, "$1$2");
            let change = change.trim_matches(python_whitespace);
            if !change.is_empty() {
                changes.push(change.to_owned());
            }
        }
    }
    if !changes.is_empty() {
        sections.push(ReleaseSection {
            heading: current_heading,
            changes,
        });
    }
    sections
}
