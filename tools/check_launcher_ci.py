"""Keep the required launcher check dependent on source checks and the browser job."""

import os

SUCCESS = "success"
SKIPPED = "skipped"


def launcher_checks_pass(checks_result, browser_result, browser_required):
    expected_browser_result = SUCCESS if browser_required else SKIPPED
    return checks_result == SUCCESS and browser_result == expected_browser_result


def main():
    checks_result = os.environ["LAUNCHER_CHECKS_RESULT"]
    browser_result = os.environ["BROWSER_TESTS_RESULT"]
    required = os.environ["BROWSER_TESTS_REQUIRED"]
    if required not in ("true", "false"):
        raise SystemExit("BROWSER_TESTS_REQUIRED must be true or false")
    if not launcher_checks_pass(checks_result, browser_result, required == "true"):
        raise SystemExit(f"Launcher checks: {checks_result}; browser tests: {browser_result}")


if __name__ == "__main__":
    main()
