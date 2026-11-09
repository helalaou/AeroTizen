# Temporary Native Home API tests for issue 188

**DO NOT MERGE. Tester build for the QN80H on Tizen 10.**

The test screen has Get test, Set test and Refresh results buttons. Get test reads
Home and startup settings. Set test writes those same values back and checks them
after each setter. It becomes available only after all required getters succeed.
Each test runs once. A saved attempt blocks another execution after a restart.

## Install and run

Extract the tester ZIP. Keep the existing Samsung signing certificates. Use the
installed CLI and replace TV_IP with the TV address.

```sh
./aerotizen --tv TV_IP install ./AeroTizen-native-home-test.wgt
```

The CLI signs the supplied WGT. It uses the normal launcher package ID and replaces
the installed launcher. The orange badge and the name beginning with AeroTizen Dev
identify the test build. Disconnect TV power for 60 seconds after installation,
then open the development app from Apps.

1. Open Settings, then About. Native Home tests appears first.
2. Select Get test. Wait for its result. The screen shows values or native errors.
3. If Get test passes, select Set test. It reports each setter and its readback.
4. Use Up and Down to focus and scroll through the result rows.

Set test uses the saved Get test result. Before each setter, it checks the current
UID, firmware and all values against that result. It writes only the matching
current value. A changed or unreadable value stops the test. Each native call has
a saved progress record, so a helper failure can show its last attempted setter.

The permission test does not assign AeroTizen as a new Home target. Successful
reads and same-value writes still need a separate Home assignment and restore
implementation, followed by physical Home-button tests. `native_home_supported`
stays `null`.

## If the service stops

Similar process launches stopped the shared web-service host on other Samsung TVs.
The screen shows a connection failure if it can still run. If the app closes,
reopen AeroTizen and return to Settings, About. Select Refresh results to load the
saved attempt. This starts the background service when needed and retrieves the
report. It does not repeat either native test.

The service persists a marker before process creation. Each helper has a
five-second timeout and a 32 KiB output limit. An interrupted attempt stays
blocked. Raw command output, device identifiers, network addresses, tokens and
signing material are excluded from the report.

## Share results

Share the displayed result and error codes. For the full JSON, start the inspector
and open the AeroTizen Console in Chrome at chrome://inspect/#devices.
Configure localhost:9222, then select Inspect for the AeroTizen target.

```sh
./aerotizen --tv TV_IP inspect launcher --port 9222
```

The following optional export only retrieves the saved results and copies them
to the clipboard. The tests are controlled by the TV buttons.

```js
fetch("http://127.0.0.1:47790/diagnostics/native-home", {
  headers: { "X-AeroTizen-Home-Probe": "diagnostic-v2" },
  cache: "no-store"
}).then(function (response) {
  return response.json();
}).then(function (report) {
  console.log(report);
  copy(JSON.stringify(report, null, 2));
});
```

To return to the stable launcher, stop the inspector with Ctrl+C, then run
`./aerotizen --tv TV_IP install launcher`.

## Build from this branch

The build host needs the .NET 6 SDK and the repository's Node dependencies. The
tester uses the installed CLI and the TV remote.

```sh
npm ci
python3 cli/tools/build_home_service_probe.py --dotnet /path/to/dotnet
npm run build:dev
```

Zip the contents of dist/launcher-dev with config.xml at the WGT archive root.
Include the entire native-home-probe directory. The standard release packaging
omits these temporary managed payloads, so use the supplied tester WGT.

The two managed assemblies keep getter imports separate from setter imports.
The setter policy is exercised by tests/native-home-service/ServiceWriteTests.cs
without loading Tizen libraries. The earlier SDB timing probe remains available
in the [runtime probe guide](home-runtime-probe.md).
