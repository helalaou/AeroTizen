import base64
import runpy
from pathlib import Path
from types import SimpleNamespace

import pytest

probe = runpy.run_path(str(Path(__file__).resolve().parents[1] / "cli" / "tools" / "probe_sdk_execution.py"))


@pytest.mark.parametrize(
    ("durations", "result"),
    [
        ([2.5, 0.1, 2.1, 2.1, 0.1], "delay_observed"),
        ([0.1, 0.1, 0.1, 0.1, 0.1], "delay_not_observed"),
        ([0.1, 0.1, 2.1, 0.1, 0.1], "inconclusive"),
    ],
)
def test_execution_probe_compares_fixed_payloads_and_filters_replies(monkeypatch, durations, result):
    now = 0.0
    samples = iter(durations)
    payloads = []

    class Session:
        def capability(self):
            return {"cpu_arch": "armv7", "sdbd_version": "private path /etc/example", "private": "secret"}

        def shell_bounded(self, command, timeout, max_output):
            nonlocal now
            assert command.startswith("0 appinstall tpk new2.tpk`")
            encoded = command.split("${IFS}%s${IFS}")[1].split("|")[0]
            payloads.append(base64.b64decode(encoded, validate=True))
            now += next(samples)
            return "Package not found [-5]: /private/path"

    monkeypatch.setitem(probe["collect"].__globals__, "time", SimpleNamespace(monotonic=lambda: now))
    report = {}
    assert probe["collect"](Session(), report) == result
    assert payloads == [b"/bin/true", b"/bin/true", b"/bin/sleep 2", b"/bin/sleep 2", b"/bin/true"]
    assert report["capabilities"] == {"cpu_arch": "armv7", "sdbd_version": None}
    assert all(sample["delay"]["reply"] == "package_not_found" for sample in report["samples"])
    assert "/private/path" not in str(report)
