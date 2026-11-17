import json
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import pytest

from aerotizen import certs


def test_samsung_sign_in_rejects_an_unrelated_callback_and_accepts_the_matching_state(monkeypatch):
    monkeypatch.setattr(certs, "CALLBACK_PORT", 0)
    expected = {"access_token": "private-token", "userId": "account-id", "inputEmailID": "demo@example.com"}
    futures = []
    with ThreadPoolExecutor(max_workers=1) as browser:

        def callback(url):
            params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            assert len(params["state"][0]) >= 32
            redirect = params["redirect_uri"][0]

            def send():
                invalid = urllib.parse.urlencode(
                    {"state": "unrelated", "code": json.dumps(expected)}
                ).encode()
                with pytest.raises(urllib.error.HTTPError) as rejected:
                    urllib.request.urlopen(redirect, data=invalid, timeout=3)
                assert rejected.value.code == 400
                valid = urllib.parse.urlencode(
                    {"state": params["state"][0], "code": json.dumps(expected)}
                ).encode()
                with urllib.request.urlopen(redirect, data=valid, timeout=3) as response:
                    assert response.status == 200

            futures.append(browser.submit(send))
            return True

        monkeypatch.setattr(certs.webbrowser, "open", callback)
        assert certs.samsung_login(timeout=3) == expected
        futures[0].result(timeout=3)


def test_samsung_sign_in_timeout_closes_the_listener(monkeypatch):
    monkeypatch.setattr(certs, "CALLBACK_PORT", 0)
    monkeypatch.setattr(certs.webbrowser, "open", lambda _: True)
    with pytest.raises(SystemExit, match="did not complete"):
        certs.samsung_login(timeout=0)
