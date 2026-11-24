"""Frozen desktop display rules used with public CLI metadata contract fixtures."""

from html import unescape


def display_text(value, fallback="Unknown"):
    if not isinstance(value, str) or not value.strip():
        return fallback
    return "".join(character for character in unescape(value).strip() if character.isprintable())[:256]
