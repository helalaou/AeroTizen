"""Read-only device compatibility tests; all network and SDB calls are mocked."""
import argparse
import importlib.util
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "tools" / "native-home-s90c" / "preflight.py"
spec = importlib.util.spec_from_file_location("native_home_s90c_preflight", SOURCE)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class NativeHomePreflightTests(unittest.TestCase):
    def test_private_ipv4_only(self):
        self.assertEqual(preflight.check_host("192.168.1.88"), "192.168.1.88")
        for host in ["127.0.0.1", "8.8.8.8", "169.254.1.3",
                     "example.org", "2001:db8::1", ""]:
            with self.subTest(host=host), self.assertRaises(argparse.ArgumentTypeError):
                preflight.check_host(host)

    def test_exact_model(self):
        self.assertEqual(
            preflight.check_model({"modelName": "QE65S90CATXZT"}), preflight.MODEL)
        for device in [None, {}, {"modelName": "QE65S95CATXZT"},
                       {"modelName": "QE65S90CATXZT-modded"}]:
            with self.subTest(device=device), self.assertRaises(RuntimeError):
                preflight.check_model(device)

    def test_exact_sdb_capabilities(self):
        self.assertTrue(preflight.check_capabilities(dict(preflight.CAPS)))
        for field in preflight.CAPS:
            mismatch = dict(preflight.CAPS)
            mismatch[field] = "not-expected"
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                preflight.check_capabilities(mismatch)
        with self.assertRaises(RuntimeError):
            preflight.check_capabilities({})

    def test_probe_never_implies_native_home_is_installed(self):
        self.assertIn("NOT_QUERIED", SOURCE.read_text())
        self.assertIn("permission_to_apply", SOURCE.read_text())
        self.assertNotIn("vconf_set_", SOURCE.read_text())
        self.assertNotIn("subprocess", SOURCE.read_text())


if __name__ == "__main__":
    unittest.main()
