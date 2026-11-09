# Temporary Native Home service test for issue 188

**DO NOT MERGE. Tester build for the QN80H on Tizen 10.**

This test asks whether AeroTizen's background service can start a bundled .NET
helper and read the TV's Home settings. The helper imports only getters and memory
release. The service saves a report in its own private app storage before it
starts the process. The report is diagnostic evidence, not a Native Home backup.
`native_home_supported` stays `null`, including after successful reads.

Other TVs have stopped their shared web-service host during a similar process
launch. If the request loses its connection, reopen AeroTizen, reconnect the
inspector and run the same console script to collect the saved result. A saved
attempt blocks a second execution, including after the service or TV restarts.

## Install the test build

Extract the tester ZIP. Keep the existing Samsung signing certificates and use
the installed CLI. Replace `TV_IP` with the TV address.

```sh
./aerotizen --tv TV_IP install ./AeroTizen-native-home-test.wgt
```

The CLI signs the supplied package. The test uses the normal AeroTizen package ID,
so it replaces the installed launcher. It has an orange development badge and a
name beginning with `AeroTizen Dev`. Disconnect TV power for 60 seconds after the
install, then open this development app from Apps.

Start the inspector and leave the command running.

```sh
./aerotizen --tv TV_IP inspect launcher --port 9222
```

In Chrome, open `chrome://inspect/#devices`, configure `localhost:9222` and inspect
the AeroTizen target. Paste the following script into its Console. It starts the
background service through `wrt:service`, waits for its HTTP endpoint, and requests
the test once. The final JSON is copied to the clipboard for review and sharing.

```js
(async function () {
  if (!window.__aeroNativeHomeService) {
    await new Promise(function (resolve, reject) {
      var timer;
      function ready() {
        clearTimeout(timer);
        window.removeEventListener("aero-native-home-service", ready);
        resolve();
      }
      window.addEventListener("aero-native-home-service", ready);
      timer = setTimeout(function () {
        window.removeEventListener("aero-native-home-service", ready);
        reject(new Error("wrt:service did not load"));
      }, 5000);
      var script = document.createElement("script");
      script.type = "module";
      script.textContent =
        "import { Service } from 'wrt:service'; window.__aeroNativeHomeService = Service; window.dispatchEvent(new Event('aero-native-home-service'));";
      document.body.appendChild(script);
    });
  }
  await new window.__aeroNativeHomeService("DclHome001.Watcher").start();
  var endpoint = "http://127.0.0.1:47790/diagnostics/native-home";
  var headers = { "X-AeroTizen-Home-Probe": "read-only-v1" };
  async function request(method) {
    var response = await fetch(endpoint, { method: method, headers: headers, cache: "no-store" });
    var result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result;
  }
  var report;
  for (var attempt = 0; attempt < 10; attempt += 1) {
    try {
      report = await request("GET");
      break;
    } catch (error) {
      if (attempt === 9) throw error;
      await new Promise(function (resolve) { setTimeout(resolve, 500); });
    }
  }
  console.log("Native Home service preflight", JSON.stringify(report));
  if (report.status === "not_run") report = await request("POST");
  for (var poll = 0; poll < 12 && report.status === "launch_requested"; poll += 1) {
    await new Promise(function (resolve) { setTimeout(resolve, 1000); });
    report = await request("GET");
  }
  console.log(JSON.stringify(report, null, 2));
  copy(JSON.stringify(report, null, 2));
  return report;
})().catch(function (error) {
  console.error("Native Home test stopped", error.message);
});
```

Share the JSON, or the last Console error if collection stops. `query_completed`
means the helper returned. Check each getter's `status` in `query` for API access.
`execution_failed` records a permission, process or runtime failure. `interrupted`
means a launch marker survived without a completion report. Missing metadata is
reported as unavailable. Raw process output, device identifiers, network addresses,
tokens and signing material are excluded from the report.

To return to the stable launcher after collecting the result, stop the inspector
with Ctrl+C, then run `./aerotizen --tv TV_IP install launcher`.

## Build from this branch

The build host needs the .NET 6 SDK and the repository's Node dependencies.
The tester needs neither Node nor .NET.

```sh
npm ci
python3 cli/tools/build_home_service_probe.py --dotnet /path/to/dotnet
npm run build:dev
```

Create the unsigned `.wgt` by zipping the contents of `dist/launcher-dev` with
`config.xml` at the archive root. Include the entire `native-home-probe/`
directory. The standard release packaging selects JavaScript assets and omits
this temporary helper, so use the supplied tester package for this test.

The test endpoint accepts only an empty POST with the fixed diagnostic header.
GET reads the saved report and never starts a process. No process runs at service
startup. Every launch uses the fixed helper path, a five-second timeout and a
32 KiB output limit. The earlier SDB timing probe remains available separately in
[the runtime probe guide](home-runtime-probe.md).
