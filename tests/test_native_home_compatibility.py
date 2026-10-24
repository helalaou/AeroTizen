"""Read-only, offline tests for cross-firmware physical HOME capability survey."""
import argparse
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "native-home-compatibility" / "survey.py"
spec = importlib.util.spec_from_file_location("home_compatibility", SOURCE)
survey = importlib.util.module_from_spec(spec)
spec.loader.exec_module(survey)
CATALOG = json.loads((SOURCE.parent / "references.json").read_text())


class MultiModelSurveyTests(unittest.TestCase):
    def test_three_distinct_firmware_families_have_independent_evidence(self):
        refs = CATALOG["references"]
        self.assertEqual(len(refs), 3)
        self.assertEqual(len({x["firmware"] for x in refs}), 3)
        self.assertEqual({x["tizen"] for x in refs}, {"9.0", "6.5"})
        self.assertEqual({x["auto_start_reference"] for x in refs}, {None, 0, 1})
        self.assertTrue(all(x["native_write_authorized"] is False for x in refs))

    def test_reference_s90c_is_not_a_firmware_certificate(self):
        device = {"modelName": "QE65S90CATXZT"}
        caps = {"cpu_arch": "armv7", "architecture": "32", "platform_version": "9.0"}
        result = survey.assess(device, caps, CATALOG)
        self.assertEqual(result["reference_evidence"], "owner_device_success")
        self.assertTrue(result["reference_match"])
        self.assertIsNone(result["firmware_reported_unverified"])
        self.assertFalse(result["native_write_authorized"])
        self.assertFalse(result["restore_validated"])

    def test_reported_firmware_mismatch_never_inherits_successful_reference(self):
        caps = {"cpu_arch": "armv7", "architecture": "32", "platform_version": "9.0"}
        device = {"modelName": "QE65S90CATXZT",
                  "firmwareVersion": "T-PTMCDEUC-0090-9999.9"}
        result = survey.assess(device, caps, CATALOG)
        self.assertFalse(result["reference_match"])
        self.assertEqual(result["reference_evidence"], "unverified")
        self.assertIsNone(result["reference_firmware"])
        self.assertFalse(result["firmware_reported_matches_reference"])
        self.assertFalse(result["native_write_authorized"])

        device["firmwareVersion"] = "T-PTMCDEUC-0090-2220.4"
        matching = survey.assess(device, caps, CATALOG)
        self.assertTrue(matching["reference_match"])
        self.assertTrue(matching["firmware_reported_matches_reference"])
        self.assertFalse(matching["native_write_authorized"])
        self.assertFalse(matching["restore_validated"])

        # Missing firmware permits only a provisional model/ABI reference
        # match; it is never a certificate or authorisation.
        del device["firmwareVersion"]
        missing = survey.assess(device, caps, CATALOG)
        self.assertTrue(missing["reference_match"])
        self.assertIsNone(missing["firmware_reported_matches_reference"])
        self.assertFalse(missing["native_write_authorized"])

    def test_external_frame_and_q70b_are_research_only_not_write_targets(self):
        for model, system in [
            ("QA55LS03DAWXXY", "9.0"),
            ("QE65Q70BATXXC", "6.5"),
        ]:
            with self.subTest(model=model):
                result = survey.assess(
                    {"modelName": model},
                    {"cpu_arch": "armv7", "architecture": "32", "platform_version": system},
                    CATALOG)
                self.assertTrue(result["reference_match"])
                self.assertEqual(result["reference_evidence"], "independent_device_report")
                self.assertFalse(result["native_write_authorized"])
                self.assertFalse(result["native_libraries_checked"])

    def test_unknown_or_mismatched_model_stays_unverified(self):
        base = {"cpu_arch": "armv7", "architecture": "32", "platform_version": "9.0"}
        for model in ["QE65S95CATXZT", "QA55LS03DAWXXY-other"]:
            result = survey.assess({"modelName": model}, base, CATALOG)
            self.assertFalse(result["reference_match"])
            self.assertFalse(result["native_write_authorized"])
        result = survey.assess(
            {"modelName": "QE65Q70BATXXC"},
            base, CATALOG)
        self.assertFalse(result["reference_match"])

    def test_incomplete_capabilities_do_not_infer_compatibility(self):
        with self.assertRaises(ValueError):
            survey.assess({}, {}, CATALOG)
        with self.assertRaises(ValueError):
            survey.assess({"modelName": "QE65S90CATXZT"}, {}, CATALOG)
        with self.assertRaises(ValueError):
            survey.assess(None, {}, CATALOG)

    def test_only_rfc1918_lan_targets_pass(self):
        for host in ["192.168.0.50", "10.42.0.2", "172.31.4.20"]:
            self.assertEqual(survey.private_ipv4(host), host)
        for host in ["127.0.0.1", "203.0.113.8", "192.0.2.2",
                     "172.32.0.4", "100.64.0.1", "8.8.8.8", "::1",
                     "a.example.com"]:
            with self.subTest(host=host), self.assertRaises(argparse.ArgumentTypeError):
                survey.private_ipv4(host)

    def test_generic_survey_cannot_modify_native_home(self):
        source = SOURCE.read_text()
        for forbidden in ["vconf_set_str(", "app_operation_set_current_app(",
                          "subprocess.", ".push(", ".shell("]:
            self.assertNotIn(forbidden, source)
        self.assertIn('"native_write_authorized": False', source)


if __name__ == "__main__":
    unittest.main()
