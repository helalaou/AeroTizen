# AeroTizen desktop

Use AeroTizen Desktop to find and save Samsung TVs and install published launcher releases.
The app uses Tauri, React, Mantine and a bundled Python worker. SQLite stores saved TV profiles.

See screenshots of [TV selection](screenshots/tv-selection.png), [Overview](screenshots/overview.png),
and [Launcher](screenshots/launcher.png).

## Install or update the launcher

1. Connect to your TV and open **Launcher**. **Update available** in Overview also opens this page.
2. Install the latest release, or select **Choose another version** to pick a published stable release.
   The change list below the install controls follows your selection.
3. Wait for the TV to report the selected version. Downgrades require confirmation and may fail on some TVs.

The app uses the signing profile for this TV from the CLI state folder. For a first install,
create it with `aerotizen --tv <TV IP> certs`, then refresh the TV in the app. For an existing
installation, use the original signing profile. See [Samsung's signing requirements](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).

## TV details and GitHub reports

Connect to a TV to open **Overview** and see its model, Tizen and launcher versions, and root status.
If the TV's IP address changes, choose **Connect at another address** from its options menu
in **Saved TVs**.
The app verifies root only when it connects through an authenticated paired root bridge.
An ordinary Developer Mode connection leaves root unverified. If a refresh fails, the app
returns to the TV list and shows the connection error. This check does not attempt root setup
or verify automatic root at boot.

Choose **TV details → Report issue** to open a GitHub issue draft in your browser with the
model, available software versions and diagnostic report filled in. Add what you observed
and submit the issue on GitHub.
It excludes TV names, network addresses, device IDs, credentials and raw command output.
For a full diagnostic ZIP, see
[CLI log export](../docs/diagnostics.md).

## Development

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), Node.js 22.12+
and Python 3.10+. Create the repository virtual environment and install the worker tools:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]' 'pyinstaller>=6.22.1,<7'
cd desktop
npm ci
npm run tauri -- dev
```

On Windows, use `.venv\Scripts\python.exe` for the Python commands. The build script
selects that virtual environment automatically. Set `AEROTIZEN_PYTHON` to use another
Python executable that has the project and PyInstaller installed.

The native development command builds and smoke-tests the standalone worker before
opening the app. TV checks use the same network access and Developer Mode settings as
the CLI. An existing valid root receipt can select the paired connection automatically.

On macOS, allow AeroTizen Desktop to access the Local Network when prompted. If the
first check fails while the prompt is open, allow access and retry the check. The main
app triggers consent because macOS can miss a request made only by a short-lived helper.
See [Apple's local network privacy guidance](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

On 16 November 2026, the local macOS 26.5.1 Apple silicon build
found and saved a Samsung Frame (`QE65LS03DAUXXU`) in the native app. Overview showed
Tizen 9.0, AeroTizen 3.1.0 and verified root through the existing pairing. The build used
ad hoc signing. First-time Local Network consent with a signed release remains unverified.

For a browser-only preview, run:

```sh
npm run dev
```

Open `http://localhost:1420/`. Vite prints network URLs for another device. Real TV
connections are available in the native app.

## Checks and packaging

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:browser
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run tauri -- build
```

Run `npm run worker:build` and `npm run build` before direct Cargo checks. The Tauri
build command runs them automatically. The worker build uses a temporary PyInstaller
cache and tests the frozen executable outside the checkout with Python removed from PATH.

From the repository root, run the backend regression checks:

```sh
.venv/bin/python -m pytest tests/test_desktop_worker.py tests/test_install.py tests/test_releases.py tests/test_sdb.py tests/test_device_cli.py
```

Browser tests use Playwright's separate bundled Chromium and fresh test profiles. Each
test run has a two-minute global limit and closes its owned browser contexts and processes.
Screenshots and traces are written to the operating system's temporary folder.

Build development packages locally with Tauri. Public distribution still needs Apple signing
and notarization and Windows signing. The initial macOS minimum is 12.3, with JavaScript
targets Safari 15.4 and Chromium 108. Older OS support needs its own native testing.

The TypeScript lint dependency uses a scoped minimatch 11 override to include its patched
glob parser. Keep lint and type checks in the validation path when updating that tooling.
