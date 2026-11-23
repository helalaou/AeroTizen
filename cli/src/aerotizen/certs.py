"""Create a Samsung TV author + distributor certificate for one TV (by DUID).

Samsung TVs only run sideloaded apps signed with certificates issued by Samsung's
developer CA. This does what Tizen Studio's Certificate Manager does: sign in to a
Samsung account in the browser, send two CSRs, and package the results as .p12.
Flow and endpoints follow the MIT-licensed Apps2Samsung project.
"""

import http.server
import json
import os
import secrets
import time
import urllib.parse
import urllib.request
import uuid
import webbrowser

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

SIGNIN_GATE = "https://account.samsung.com/accounts/be1dce529476c1a6d407c4c7578c31bd/signInGate"
CLIENT_ID = "v285zxnl3h"
CALLBACK_PORT = 4794
CALLBACK_PATH = "/signin/callback"
SIGN_IN_TIMEOUT_SECONDS = 300
CALLBACK_READ_TIMEOUT_SECONDS = 5
MAX_CALLBACK_BYTES = 64 * 1024
AUTHOR_URL = "https://svdca.samsungqbe.com/apis/v3/authors"
DIST_V1_URL = "https://svdca.samsungqbe.com/apis/v1/distributors"
DIST_V3_URL = "https://svdca.samsungqbe.com/apis/v3/distributors"
CA_DIR = os.path.join(os.path.dirname(__file__), "ca")


def samsung_login(timeout=SIGN_IN_TIMEOUT_SECONDS):
    """Open Samsung's sign-in page and wait for the browser to post the token back."""
    result = {}
    state = secrets.token_urlsafe(32)

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != CALLBACK_PATH:
                self.send_error(404)
                return
            self.connection.settimeout(CALLBACK_READ_TIMEOUT_SECONDS)
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_CALLBACK_BYTES:
                    raise ValueError
                form = urllib.parse.parse_qs(self.rfile.read(length).decode())
                ok = secrets.compare_digest(form.get("state", [""])[0], state)
                auth = json.loads(form["code"][0])
                ok = (
                    ok
                    and isinstance(auth, dict)
                    and all(
                        isinstance(auth.get(key), str) and bool(auth[key].strip())
                        for key in ("access_token", "userId")
                    )
                )
            except (OSError, ValueError, KeyError, TypeError):
                ok = False
            if ok:
                result.update(auth)
            self.send_response(200 if ok else 400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                (
                    "<h2 style='font-family:sans-serif'>Signed in. You can close this tab.</h2>"
                    if ok
                    else "Sign-in failed. Close this tab and try again."
                ).encode()
            )

        def log_message(self, *args):
            pass

    with http.server.HTTPServer(("localhost", CALLBACK_PORT), Handler) as server:
        redirect = f"http://localhost:{server.server_address[1]}{CALLBACK_PATH}"
        url = (
            f"{SIGNIN_GATE}?locale=&clientId={CLIENT_ID}&redirect_uri={urllib.parse.quote(redirect, safe='')}"
            f"&state={state}&tokenType=TOKEN"
        )
        print("Opening Samsung sign-in in your browser...\n  " + url)
        deadline = time.monotonic() + timeout
        if not webbrowser.open(url):
            raise SystemExit("Could not open Samsung sign-in in your browser.")
        while not result and time.monotonic() < deadline:
            server.timeout = min(1, max(0, deadline - time.monotonic()))
            server.handle_request()
    if not result.get("access_token"):
        raise SystemExit("Samsung sign-in did not complete.")
    return result


def _multipart(fields, file_field, filename, data):
    boundary = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; '
        f'filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()
        + data
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def _post(url, fields, filename, csr):
    body, ctype = _multipart(fields, "csr", filename, csr)
    req = urllib.request.Request(url, data=body, headers={"Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        raise SystemExit(f"Samsung certificate server refused {url}: {e.code} {detail}") from e


def _csr(key, subject, sans=None):
    builder = x509.CertificateSigningRequestBuilder().subject_name(subject)
    if sans:
        builder = builder.add_extension(
            x509.SubjectAlternativeName([x509.UniformResourceIdentifier(u) for u in sans]), critical=False
        )
    return builder.sign(key, hashes.SHA256()).public_bytes(serialization.Encoding.PEM)


def _load_cert(data):
    try:
        return x509.load_pem_x509_certificate(data)
    except ValueError:
        return x509.load_der_x509_certificate(data)


def create_profile(duid, out_dir, auth=None):
    """Sign in (unless `auth` is given) and write author.p12, distributor.p12, password.txt."""
    auth = auth or samsung_login()
    token, user_id, email = auth["access_token"], auth["userId"], auth.get("inputEmailID") or ""
    os.makedirs(out_dir, exist_ok=True)
    password = secrets.token_urlsafe(18)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    author_csr = _csr(key, x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "aerotizen")]))
    dist_csr = _csr(
        key,
        x509.Name(
            [
                x509.NameAttribute(NameOID.COMMON_NAME, "TizenSDK"),
                x509.NameAttribute(NameOID.EMAIL_ADDRESS, email),
            ]
        ),
        ["URN:tizen:packageid=", f"URN:tizen:deviceid={duid}"],
    )

    base = {"access_token": token, "user_id": user_id, "platform": "VD"}
    author = _load_cert(_post(AUTHOR_URL, base, "author.csr", author_csr))
    dist_fields = dict(base, privilege_level="public", developer_type="Individual")
    profile_xml = _post(DIST_V1_URL, dist_fields, "distributor.csr", dist_csr)
    distributor = _load_cert(_post(DIST_V3_URL, dist_fields, "distributor.csr", dist_csr))

    with open(os.path.join(CA_DIR, "vd_tizen_dev_author_ca.cer"), "rb") as f:
        author_ca = _load_cert(f.read())
    with open(os.path.join(CA_DIR, "vd_tizen_dev_public2.crt"), "rb") as f:
        dist_ca = _load_cert(f.read())

    enc = serialization.BestAvailableEncryption(password.encode())
    for name, cert, ca in (("author", author, author_ca), ("distributor", distributor, dist_ca)):
        with open(os.path.join(out_dir, f"{name}.p12"), "wb") as f:
            f.write(pkcs12.serialize_key_and_certificates(name.encode(), key, cert, [ca], enc))
    with open(os.path.join(out_dir, "password.txt"), "w") as f:
        f.write(password)
    with open(os.path.join(out_dir, "device-profile.xml"), "wb") as f:
        f.write(profile_xml)
    os.chmod(out_dir, 0o700)
    return out_dir
