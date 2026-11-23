# AeroTizen desktop

Use AeroTizen Desktop to find and save Samsung TVs, install the launcher and local apps,
manage installed apps, configure Home and remote buttons, and set up or update root access.
The app uses Tauri, React, Mantine and a bundled Python worker. SQLite stores saved TV profiles.

See screenshots of [TV selection](screenshots/tv-selection.png), [Overview](screenshots/overview.png),
and [Launcher](screenshots/launcher.png).

## Install or update the launcher

1. Connect to your TV and open **Launcher**. **Update available** in Overview also opens this page.
2. Install the latest release, or select **Choose another version** to pick a published stable release.
   The change list below the install controls follows your selection.
3. Wait for the TV to report the selected version. Downgrades require confirmation and may fail on some TVs.

Use **Refresh launcher releases** beside the page title to check for new releases without
restarting the app. The current release stays visible while the check runs.

If a first install needs signing certificates, the app guides you through Samsung
sign-in in your browser, creates the TV's signing profile, and continues installation.
You can also sign in and out through the app menu. The account session lasts until
sign-out, expiry, or closing the app. Certificates are saved per TV for future updates.
The app reuses signing profiles from the CLI state folder. For an existing installation,
use its original signing profile. See [Samsung's signing requirements](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).

See screenshots of [Samsung sign-in](screenshots/samsung-sign-in.png),
[certificate setup](screenshots/samsung-certificates.png), and the
[account menu after installation](screenshots/samsung-account-menu.png).

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

Open **Apps** to search the TV's installed packages by name. A package can contain more
than one app. The list shows them together and labels packages the CLI protects.
Select packages and choose **Remove**. Review the apps and TV in the confirmation
before you remove them. If the TV refuses removal, the package shows **Delete on TV**.
Check for **Delete** in **Apps → Settings** on the TV. Use **Refresh apps** to fetch the current list.

See screenshots of [removal confirmation](screenshots/apps-confirm-removal.png) and
[removal results](screenshots/apps-removal-results.png).

In **Apps**, choose **Install app** to select a local Tizen `.wgt` file. Review the app,
version and target TV before installing. Replacing an installed app requires confirmation;
older versions can be incompatible with saved settings and updates need the original
signing certificate. The app guides you through Samsung sign-in and certificate setup
when needed, then signs the widget with this TV's saved profile. Installation succeeds
only after the TV reports the selected version, and the app list refreshes automatically.
If the file or installed package changes after review, choose the file again.
Local widgets are limited to 256 MiB compressed and 512 MiB unpacked.

See screenshots of [local app review](screenshots/local-app-install.png) and
[replacement confirmation on mobile](screenshots/local-app-replace-mobile.png).

Open **Home and startup** to see the AeroTizen routing mode. On a rooted TV with a
compatible paired helper, the page also shows the current Home button assignment,
startup apps and Smart Hub autostart. When an original backup exists, select
**Backup & restore** to review its settings, then **Restore original settings** to
apply them back to the selected TV after confirmation.

When AeroTizen routing is in Watcher mode, select **Apply Native Home** to switch the
TV's Home app, startup apps and Smart Hub autostart to AeroTizen after confirmation.
Apply first prepares the original backup, reusing a valid one for the selected TV; a
first capture needs an updated paired helper and complete, unchanged Home and startup
settings. Once applied, AeroTizen routing shows Native Home mode.

See screenshots of [Home and startup](screenshots/home-and-startup.png),
[backup and restore](screenshots/home-backup-status.png), and
[Apply Native Home](screenshots/apply-native-home.png).

Open **Button mapping** to see the remote's detected app buttons and their saved
assignments. A rooted TV needs a compatible paired helper. A pending assignment
is saved and waiting for the remote or helper to activate it.
Open a button's action menu to choose an installed app, disable the button, or
restore its original action.
Choose **Rename** in the button's action menu to save a new name on the TV while keeping
its physical button and assigned action. Renaming needs a helper that supports this action.
Use **Learn a button** for an app button the TV did not detect. Enter a name
and press the app button when the dialog prompts you. **Reset all buttons** in
the page menu restores every original action and forgets manually learned buttons.

See screenshots of [Button mapping](screenshots/button-mapping.png),
[choosing an app](screenshots/button-mapping-app-picker.png),
[renaming a button](screenshots/button-mapping-rename.png),
[learning a button](screenshots/button-mapping-learn.png), and
[resetting all buttons](screenshots/button-mapping-reset.png).

## Root access

Open **Root access** for a fresh status check, or use **Refresh root status** to check again.
The page shows root availability, the live helper version, automatic startup verification
and whether setup progress is saved on this computer. Missing pairing or an unreachable
helper shows **Unverified**; a saved recovery record alone does not establish live access.

Choose **Set up root access** and confirm the Developer Mode settings. The app reuses
the CLI's setup, prepares Samsung signing certificates when needed and saves its private
recovery record before root changes. After installation, follow the Host PC IP and
60-second power-disconnect instructions, then choose **Check after restart**. Setup stays
pending until the CLI verifies a new automatic boot and finishes its checks. Reopen the
page and choose **Continue setup** to resume saved progress. Setup preserves Home, launcher
startup and Art Mode settings.

When the live helper is older than the bundled CLI, choose **Update available**. Review
the installed and target versions, confirm, then update using the original signing
certificates. The update preserves pairing and saves progress. Restart the TV and choose
**Check after restart**; completion requires the new runtime on a new automatic boot.
Use **Continue update** after interruption. The dialog includes recovery steps if root
access does not return. Root removal remains a CLI feature.

See screenshots of [Root access](screenshots/root-access.png),
[update confirmation](screenshots/root-update-review.png), and
[restart verification on mobile](screenshots/root-restart-mobile.png).

Development fixtures include an older helper on Living room, a fresh Bedroom TV and interrupted
setup on Office. In the browser preview, **Demo: restart TV** simulates a new boot; it
does not complete setup until **Check after restart** verifies it. The native adapter
does not expose the simulation control. See [the CLI root guide](../docs/root-cli.md)
for hardware validation and recovery details.

## Development

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), Node.js 22.12+,
Python 3.10+ and the .NET 6 SDK. Create the repository virtual environment and install the worker tools:

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
Set `AEROTIZEN_DOTNET` to the .NET executable if it is not on `PATH`.

The native development and packaging commands rebuild the Home reader, Home writer and
root runtime before freezing the standalone worker. The build validates each payload and
compares the frozen inventory against this checkout, then checks the worker protocol with
Python removed from `PATH`. A missing SDK, failed helper build or invalid payload stops the build.
TV checks use the same network access and Developer Mode settings as
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

The desktop has separate UI, native command, service and transport layers:

| Path                      | Responsibility                                                                   |
| ------------------------- | -------------------------------------------------------------------------------- |
| `src/components/`         | Views and dialogs                                                                |
| `src/features/`           | Launcher, Apps, buttons, Home and root state and actions                         |
| `src/useTvManager.ts`     | TV selection, shared operation ownership and feature composition                 |
| `src/services/native.ts`  | Frontend IPC adapter                                                             |
| `src-tauri/src/lib.rs`    | Tauri setup, plugins, managed state and command registration                     |
| `src-tauri/src/commands/` | Native command adapters and OS dialogs                                           |
| `src-tauri/src/services/` | TV operations, account sessions and profile storage; no Tauri API dependency     |
| `src-tauri/src/models/`   | Typed command inputs and results                                                 |
| `src-tauri/src/worker.rs` | Python worker protocol, process lifetime, cancellation and typed result decoding |

Keep new TV logic in services and leave commands thin. Migrate each service from the Python
worker to Rust while preserving its command names and result contract. Keep identity checks,
backup checks and verification of TV changes at the service boundary.

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
.venv/bin/python -m pytest desktop/tests
```

Browser tests use Playwright's separate bundled Chromium and fresh test profiles. Each
test run has a two-minute global limit and closes its owned browser contexts and processes.
Screenshots and traces are written to the operating system's temporary folder.

Build development packages locally with Tauri. Public distribution still needs Apple signing
and notarization and Windows signing. The initial macOS minimum is 12.3, with JavaScript
targets Safari 15.4 and Chromium 108. Older OS support needs its own native testing.

The TypeScript lint dependency uses a scoped minimatch 11 override to include its patched
glob parser. Keep lint and type checks in the validation path when updating that tooling.
