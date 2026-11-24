"""Canonical signing bytes stay compatible with the public CLI signer."""

import base64
import hashlib
import json
from pathlib import Path

from aerotizen import signer


def test_native_signature_fixture_matches_cli():
    fixture = json.loads((Path(__file__).parent / "fixtures/widget-signatures.json").read_text())
    files = [(item["name"], bytes.fromhex(item["data_hex"])) for item in fixture["files"]]
    for case in fixture["cases"]:
        role = case["role"]
        properties = signer._prop_object(role, True)
        digest = base64.b64encode(hashlib.sha512(properties.encode()).digest()).decode()
        assert digest == case["property_digest"]
        for namespace in (True, False):
            assert signer._prop_object(role, namespace) == case["properties"][str(namespace).lower()]
            assert (
                signer._signed_info(files, digest, namespace) == case["signed_info"][str(namespace).lower()]
            )
