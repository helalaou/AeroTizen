"""The stable required check must fail when any selected browser job does not pass."""

import os
import runpy
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "tools/check_launcher_ci.py"
launcher_checks_pass = runpy.run_path(str(SCRIPT))["launcher_checks_pass"]


class LauncherCIGateTests(unittest.TestCase):
    def test_passes_after_source_checks_and_the_browser_job_succeed(self):
        self.assertTrue(launcher_checks_pass("success", "success", True))

    def test_format_only_changes_allow_skipped_browser_jobs(self):
        self.assertTrue(launcher_checks_pass("success", "skipped", False))

    def test_a_failed_cancelled_or_missing_check_blocks_success(self):
        for checks in ("failure", "cancelled", "skipped", ""):
            with self.subTest(checks=checks):
                self.assertFalse(launcher_checks_pass(checks, "success", True))

    def test_a_failed_cancelled_or_missing_browser_job_blocks_success(self):
        for browser in ("failure", "cancelled", "skipped", ""):
            with self.subTest(browser=browser):
                self.assertFalse(launcher_checks_pass("success", browser, True))

    def test_format_only_changes_do_not_hide_check_failures(self):
        self.assertFalse(launcher_checks_pass("failure", "skipped", False))

    def test_an_invalid_required_flag_cannot_allow_a_skipped_suite(self):
        for required in ("", "unexpected"):
            with (
                self.subTest(required=required),
                patch.dict(
                    os.environ,
                    LAUNCHER_CHECKS_RESULT="success",
                    BROWSER_TESTS_RESULT="skipped",
                    BROWSER_TESTS_REQUIRED=required,
                ),
                self.assertRaisesRegex(SystemExit, "must be true or false"),
            ):
                runpy.run_path(str(SCRIPT), run_name="__main__")


if __name__ == "__main__":
    unittest.main()
