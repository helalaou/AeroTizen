pub fn case_fold(value: &str) -> String {
    icu_casemap::CaseMapper::new()
        .fold_string(value)
        .into_owned()
}

/// Match Python's whitespace rules, including its four ASCII separators.
pub fn python_whitespace(character: char) -> bool {
    character.is_whitespace() || matches!(character, '\u{1c}'..='\u{1f}')
}

pub fn display_text(value: Option<&serde_json::Value>, limit_characters: usize) -> Option<String> {
    use unicode_general_category::{get_general_category, GeneralCategory};
    let value = value?.as_str()?.trim_matches(python_whitespace);
    if value.is_empty() {
        return None;
    }
    Some(
        htmlize::unescape(value)
            .trim_matches(python_whitespace)
            .chars()
            .filter(|character| {
                *character == ' '
                    || !matches!(
                        get_general_category(*character),
                        GeneralCategory::Control
                            | GeneralCategory::Format
                            | GeneralCategory::Surrogate
                            | GeneralCategory::PrivateUse
                            | GeneralCategory::Unassigned
                            | GeneralCategory::LineSeparator
                            | GeneralCategory::ParagraphSeparator
                            | GeneralCategory::SpaceSeparator
                    )
            })
            .take(limit_characters)
            .collect(),
    )
}
