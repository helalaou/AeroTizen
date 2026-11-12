# Watcher startup test for issue 188

This build starts the background watcher through `wrt:service` on Tizen 10.
Tizen 9 keeps the existing AppControl start first. It tries `wrt:service` only if
the service still does not answer after 1.5 seconds of readiness checks. Older
versions keep AppControl without the module fallback.
It waits for an HTTP reply from the service. If a watcher request fails, it starts
the service, restores its app inventory and retries the request once. Startup has
a 30-second deadline to allow for a slow service start after a cold boot.
On Tizen 10, YouTube waits for its watch acknowledgement like other apps. Older
firmware keeps the confirmed watcher pause for YouTube. App launches wait for
their acknowledgement before AeroTizen can be hidden and frozen. Repeat app taps
are ignored while the first launch waits for the watcher. Old recovery requests
cannot undo a newer Home handoff.

This package has the normal launcher UI and the orange development badge. It
contains no temporary Native Home tests or managed diagnostic helpers.

## Install

Use a fresh development package from this branch. The earlier `0c9c8b1` archive
does not include the changes from PR #204 or the later handoff cancellation fix.

Stop any running inspector with Ctrl+C. Extract the ZIP and place the WGT beside
your existing `aerotizen` executable. Keep your existing signing certificates.
Replace TV_IP with the TV address.

```sh
./aerotizen --tv TV_IP install ./AeroTizen-watcher-startup-test.wgt
```

Disconnect TV power for 60 seconds, reconnect it and open **AeroTizen Dev** from Apps.
No Console commands or Settings test buttons are needed to start the watcher.

## Test

1. Press Home while AeroTizen is visible. Check that it returns from Samsung Home.
2. Open YouTube from AeroTizen. Check that it opens without a HomeWatcher error.
3. Return to AeroTizen, open another app and press Home from that app. Report which
   app you used and roughly how long the return took.
4. Turn the TV off and on with the remote, then repeat those tests. If AeroTizen
   does not open by itself, open it from Apps and report that separately.
5. Disconnect power for 60 seconds again. Report whether AeroTizen opens by itself
   after power returns, and whether Home return still works after opening it.

The watcher can briefly show Samsung Home before AeroTizen returns. This test
checks startup and recovery without changing the Home assignment. Watched apps
on non-Frame TVs have a 1.5-second hidden grace period before the watcher returns
to AeroTizen. Frame Art Mode guards remain unchanged. Automatic startup after
wake and cold boot still needs this TV test.

If a handoff fails, keep AeroTizen open and export the logs before restarting:

```sh
./aerotizen --tv TV_IP logs export --output watcher-startup-results.zip
```

Attach that ZIP and describe the failed step, the app used, the delay and any
on-screen error. The TV records the service start acknowledgement and its first
successful HTTP reply separately, including the startup method and wait time.
Older CLIs can omit new event types. An optional `collect-watcher-results.js`
Console script in the ZIP copies the full redacted UI and service reports.
To use it, run `./aerotizen --tv TV_IP inspect launcher --port 9222`, open
`chrome://inspect/#devices` in Chrome, configure `localhost:9222`, then select
Inspect for AeroTizen. Paste the script into its Console. It copies the report;
it does not start or stop the watcher. Stop the inspector with Ctrl+C afterwards.

To return to the stable launcher:

```sh
./aerotizen --tv TV_IP install launcher
```
