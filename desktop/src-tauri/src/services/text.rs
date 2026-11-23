/// Match Python's whitespace rules, including its four ASCII separators.
pub fn python_whitespace(character: char) -> bool {
    character.is_whitespace() || matches!(character, '\u{1c}'..='\u{1f}')
}
