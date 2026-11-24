# AeroTizen desktop

Use AeroTizen Desktop to find and save Samsung TVs, install the launcher and local apps,
manage installed apps, configure Home and remote buttons, and set up or update root access.
The app uses Tauri, React and Mantine. Rust owns all desktop TV operations, Samsung
account sessions, signing and recovery. SQLite stores saved TV profiles. Installed apps
include the managed TV helpers and need no Python runtime or CLI executable.

See screenshots of [TV selection](screenshots/tv-selection.png), [Overview](screenshots/overview.png),
and [Launcher](screenshots/launcher.png).

## Install or update the launcher

1. Connect to your TV and open **Install & update**. **Install AeroTizen** and
   **Update available** in Overview also open this page.
   The status shows whether AeroTizen is installed, has an update, or is up to date.
2. Use the action at the top to install or update to the latest release. Select any published
   stable version in **Release history** to review its notes and install that version.
   The sparkles mark the latest release, and the monitor marks the version installed on the TV.
3. Wait for the TV to report the selected version. Downgrades require confirmation and may fail on some TVs.

Use **Refresh releases** beside the page title to check for new releases without
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

Choose **Report issue** in the Overview header to open a GitHub issue draft in your browser with the
model, available software versions and diagnostic report filled in. Add what you observed
and submit the issue on GitHub.
It excludes TV names, network addresses, device IDs, credentials and raw command output.
Open **Logs** from the app menu to see desktop operations, newest first. The app keeps
up to 250 entries on this computer. **Export logs** saves a diagnostic ZIP with desktop
activity, build and platform details, and up to 20 redacted Home recovery summaries.
When a TV is selected, you can also include launcher and background service logs and a
live Home settings snapshot. The snapshot uses a compatible paired Root connection.
If a TV check fails, the ZIP records the reason and still includes the desktop data.
Reports omit account details, TV addresses, raw output and original recovery files.
The browser simulator downloads a text log of simulated activity.
See the [Logs view](screenshots/logs.png).

Open **Apps** to search the TV's installed packages by name. A package can contain more
than one app. The list shows them together and labels packages the CLI protects.
Select packages and choose **Remove selected**. Review the apps and TV in the confirmation
before you remove them. If the TV refuses removal, the package shows **Delete on TV**.
Check for **Delete** in **Apps → Settings** on the TV. Use **Refresh apps** to fetch the current list.

See screenshots of the [installed apps list](screenshots/apps.png),
[removal confirmation](screenshots/apps-confirm-removal.png) and
[removal results](screenshots/apps-removal-results.png).

In **Apps**, choose **Install from file** to select a local Tizen `.wgt` file. Review the app,
version and target TV before installing. Replacing an installed app requires confirmation;
older versions can be incompatible with saved settings and updates need the original
signing certificate. The app guides you through Samsung sign-in and certificate setup
when needed, then signs the widget with this TV's saved profile. Installation succeeds
only after the TV reports the selected version, and the app list refreshes automatically.
If the file or installed package changes after review, choose the file again.
Local widgets are limited to 256 MiB compressed and 512 MiB unpacked.

See screenshots of [local app review](screenshots/local-app-install.png) and
[replacement confirmation on mobile](screenshots/local-app-replace-mobile.png).

Open **Home and startup** to see how AeroTizen opens. With a compatible version of
root access, **Current settings** shows the Home button assignment,
startup app and Smart Hub auto-start. Open **Advanced details** to see the saved
Home setting and backup startup app. When an original backup exists, select
**Restore original settings…** in the header to review it and confirm the restore.

In Watcher mode, AeroTizen reopens after Samsung Home. Select **Use AeroTizen for
Home and startup** to configure the TV to open AeroTizen directly. The app prepares
the original backup first and reuses any valid backup for this TV. A first backup
needs an up-to-date version of root access and complete, unchanged Home and startup settings.

See screenshots of [Home and startup](screenshots/home-and-startup.png),
[backup and restore](screenshots/home-backup-status.png), and
[Home and startup setup](screenshots/apply-native-home.png).

Open **Button mapping** to see the remote's detected app buttons and their saved
assignments. Button mapping needs a compatible version of root access. If root access is
unverified, select **Open Root access** to check the TV. Changes are saved before
the TV finishes restarting button handling. After an app assignment or Disable change,
the app checks for up to ten seconds and shows **Checking…**, then **Active** when confirmed.
The list stays visible during these checks. **Not confirmed** means the change is saved
but has not been confirmed active; use Refresh to check again. Leaving the page or
starting another action cancels the check. Restoring an original action needs no such check.
Open a button's action menu to choose an installed app, disable the button, or
restore its original action.
Choose **Rename** in the button's action menu to save a new name on the TV while keeping
its physical button and assigned action. Renaming needs a version of root access that supports it.
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
When root access is ready, the card shows the installed version and whether the recovery
record is saved on this computer. Select **Show in folder** to find a saved record in the
desktop file manager. The app verifies automatic startup before it reports setup is complete.
Root access shows **Unverified** if the app cannot confirm the pairing.
Overview also checks live root status. Select **Check root status** beside **Unverified**
to open Root access. When an update is available, select
**Update available** beside **Root access version** to open Root access.

Choose **Set up root access** and confirm the Developer Mode settings. The app prepares
Samsung signing certificates when needed and saves its private
recovery record before root changes. After installation, follow the Host PC IP and
60-second power-disconnect instructions, then choose **Check after restart**. Setup stays
pending until the app verifies a new automatic boot and finishes its checks. Reopen the
page and choose **Continue setup** to resume saved progress. Setup preserves Home, launcher
startup and Art Mode settings.

When a newer version of root access is available, choose **Update available**. Review
the installed and target versions, confirm, then update using the original signing
certificates. The update preserves pairing and saves progress. Restart the TV and choose
**Check after restart**; completion requires the new runtime on a new automatic boot.
Use **Continue update** after interruption. The dialog includes recovery steps if root
access does not return.

Choose **Remove root** to remove root access from a paired TV. The app asks
for confirmation and saves progress before restart. Follow the Developer Mode instructions
in the dialog, then select **Finish removal** to verify removal. Use
**Continue removal** to resume saved progress. Remote button remaps and the Stremio feed
stop working after removal. The launcher stays installed.

See screenshots of [Root access](screenshots/root-access.png),
[update confirmation](screenshots/root-update-review.png),
[removal confirmation](screenshots/root-remove-confirmation.png), and
[restart verification on mobile](screenshots/root-restart-mobile.png).

See [the CLI root guide](../docs/root-cli.md) for hardware validation and recovery details.

## Development

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), Node.js 22.12+,
Python 3.10+ and the .NET 6 SDK. Python is used only by the shared managed-payload
build scripts, which use its standard library. The desktop build does not install the
CLI or use PyInstaller.

```sh
cd desktop
npm ci
npm run tauri -- dev
```

The build uses the repository virtual environment if present, or `python3` (`python`
on Windows). Set `AEROTIZEN_PYTHON` to select another Python executable, and
`AEROTIZEN_DOTNET` to select .NET when it is not on `PATH`.

Native certificate cryptography builds a bundled OpenSSL library. Building it requires
a C compiler and Perl, including on Windows. Installed desktop apps need no separate
OpenSSL installation.

Native development and packaging rebuild the Home reader, Home writer and Root runtime,
then embed their JSON payloads in Rust. A missing SDK or failed helper build stops the build.
The native services check the embedded schema, inventory and hashes before sending files.
TV checks use the same network access and Developer Mode settings as the CLI. An existing
valid Root receipt can select the paired connection automatically.

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

### Local TV simulator

To work on the UI without a TV or Samsung account, run:

```sh
npm run dev:simulator
```

Open `http://localhost:1430/` and choose **TV simulator** at the bottom right. The app
uses its normal views with a local service adapter. No TV commands, Samsung requests,
real certificate writes or native profile changes are made. The simulator requires
only Node and the desktop npm dependencies.

- **TVs:** add a TV from a preset, then edit its name, address, model, Tizen and launcher
  versions, Root status, Home routing, backup status, power, discovery and certificates.
  **Save and reload preview** returns to the TV list with the new state. Starter TVs
  include a TV with updates available, a fresh TV and a Watcher TV without root access.
- **Requests:** set a response delay to inspect loading states and cancellation, or
  fail one selected request with a custom message. Close the panel and use the app to
  trigger that request. The failure clears after it runs; cancelled reads leave it armed.
- **Releases:** use live GitHub versions and release notes by default. In the native
  simulator, this reuses the app's read-only Rust release command; the browser preview
  reads the public GitHub releases API. **Refresh releases** fetches current
  metadata. Launcher installation still changes only the simulated TV. For an offline
  or repeatable scenario, select Custom or explicitly load sample releases.
- **Scenario JSON:** copy or edit the complete state, including app inventories,
  protected labels, packages that refuse removal, button mappings, original Home
  settings, root setup progress, local widget details and custom launcher releases/change notes.
  The `releases` field is used only when `release_source` is `custom`. Existing scenarios
  without that field default to GitHub. GitHub errors show Retry; they do not silently
  switch to sample versions.
  **Load JSON** checks the data before replacing the scenario. **Reset starter TVs**
  and **Start empty** provide clean starting points.

State persists across reloads in this browser's local storage, separately for each
hostname. Simulated installs, removals, button changes and Home backup/restore update
that state. Samsung sign-in is simulated. Local installation selects the sample widget
defined in the scenario. Learn simulates a remote press. Root setup/update stay pending
until **Demo: restart TV** and **Check after restart** are used in the normal dialogs.
The original Home backup is kept after the first apply and reused by later applies.

The same simulator can run inside a native development window, with the usual native
build prerequisites:

```sh
npm run dev:simulator:desktop
```

This uses the normal Vite server on port 1420 with `?simulator=1` and a separate native
app identifier, so its WebView storage and TV profile database are separate from the
normal app. The browser simulator on port 1430 can stay open alongside it.

On an existing normal Vite dev server, `/?simulator=1` also opens the simulator.
`npm run dev` and `npm run tauri -- dev` keep their normal behavior. Production builds
exclude the simulator, even when built with `--mode simulator`; it cannot be enabled
in an installed release. These scenarios test UI behavior, not Rust services or TV
compatibility. Desktop CI remains unchanged.

See screenshots of [TV editing](screenshots/simulator-tvs.png),
[request delays and failures](screenshots/simulator-requests.png),
[release source controls](screenshots/simulator-releases.png),
[live launcher releases](screenshots/simulator-live-launcher.png), and the
[mobile simulator controls](screenshots/simulator-mobile.png).

## Checks and packaging

The desktop has separate UI, command, service and transport layers:

| Path                                | Responsibility                                               |
| ----------------------------------- | ------------------------------------------------------------ |
| `src/components/`, `src/features/`  | Views, feature state and actions                             |
| `src/useTvManager.ts`               | TV selection and shared operation ownership                  |
| `src/services/native.ts`            | Frontend IPC adapter                                         |
| `src-tauri/src/lib.rs`, `commands/` | Tauri setup, registration and thin command adapters          |
| `src-tauri/src/services/`           | Native TV operations, account sessions, signing and recovery |
| `src-tauri/src/models/`             | Typed command inputs and results                             |
| `tools/build-helpers.mjs`           | Build-only entry for the shared managed TV payloads          |

Keep TV rules in services and leave commands thin. Share the CLI's TV lock and state
formats. Keep identity checks, reviewed input validation, backups and readback at the
service boundary. SQLite connections and filesystem/crypto work stay in owned blocking
operations; sockets, listeners and cancellation stay with their async service owner.

Discovery, metadata, release lookup/download, Samsung sign-in and certificates, app
inventory/removal/installation, Home controls, button mapping and Root setup/updates run
in Rust. The desktop does not start a Python process. The public Python CLI remains a
separate tool; its commands are unchanged.

The SDK transport stages checked managed helpers with a single-use callback. Home Apply
and Restore save durable recovery intent before writing, preserve the exact original
backup and verify final Home/startup settings. Root installation uses a signed dedicated
helper and private pinned TLS bootstrap, checks Home/registration preservation and waits
for restart proof. Updates preserve pairing, resume committed installs without repeating
them, and require the target runtime/configuration on a new automatic boot. Root
configuration bytes and recovery formats match the CLI. Failed writes are never retried
automatically.

Network requests, archives, protocol replies and operation deadlines are bounded.
Paired TLS checks the saved certificate before sending credentials and requires fresh
proof. Samsung tokens remain in memory; the UI receives only the account email. Signing
keys and Root recovery material stay on this computer or pass through the private
pinned transfer. Optional GitHub API credentials stay at the fixed API endpoint and
never pass to asset downloads.

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

`cargo test` runs unit, loopback protocol and registered Tauri command tests without a
TV, Python, generated helpers or frontend build. Unit tests stay beside their modules;
larger modules use `module/tests.rs`. Timer tests use Tokio's paused clock. Socket tests
use bounded local servers. Contract fixtures compare native behavior with the public CLI.

The `desktop-app` feature selects the production Tauri configuration, embeds device
payloads and enables the app binary. Tauri enables it automatically. Bare Cargo checks
use `src-tauri/tests/tauri.conf.json`, with no generated assets. Check the production
library and embedded payloads separately:

```sh
npm run helpers:build
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --features desktop-app --lib
cargo test --manifest-path src-tauri/Cargo.toml --features desktop-app --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --features desktop-app --all-targets -- -D warnings
```

Use `--lib` for production-feature tests so Cargo does not replace a standalone app
binary with an executable that expects Vite. Tauri packaging builds the helpers and
frontend automatically. Its app bundle contains the native executable and no sidecar.

From the repository root, run the CLI compatibility checks in the development environment:

```sh
.venv/bin/python -m pytest desktop/tests
```

These Python tests compare shared protocol/package fixtures and check the build entry.
They are development checks and are not shipped with the installed app. Physical TV
and Windows runtime checks remain separate from host tests and browser fixtures.

Browser tests use Playwright's separate bundled Chromium and fresh test profiles. Each
test run has a two-minute global limit and closes its owned browser contexts and processes.
Screenshots and traces are written to the operating system's temporary folder.

Build development packages locally with Tauri. Public distribution still needs Apple signing
and notarization and Windows signing. The initial macOS minimum is 12.3, with JavaScript
targets Safari 15.4 and Chromium 108. Older OS support needs its own native testing.

The TypeScript lint dependency uses a scoped minimatch 11 override to include its patched
glob parser. Keep lint and type checks in the validation path when updating that tooling.
