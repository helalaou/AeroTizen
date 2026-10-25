# PC-managed native Home

Use the updated CLI and a compatible signed launcher. The PC owns the original
Home backup and transaction receipts. Apply and restore run from the CLI; the
launcher does not change these native settings from its UI. The TV then operates
without a running PC or watcher polling.

## Setup

After installing and opening the compatible launcher:

```sh
aerotizen --tv TV_IP home status
aerotizen --tv TV_IP home backup
aerotizen home apply --boot --art-return                 # offline preview
aerotizen --tv TV_IP home apply --boot --art-return --yes
```

The original is saved once in the PC's
`~/.config/aerotizen/backups/<TV identity>/original-home.json`.
Before the native writer runs, its request and baseline bytes are durably saved
under the adjacent `transactions/` directory. Apply needs no TV backup endpoint.
Restart the TV fully after applying Art return, then test Home, boot and Art Mode.

Running `home backup` after apply keeps the validated original file unchanged.
It reports that the current native settings differ from the original; it does
not capture the AeroTizen assignment as a new original. A missing original still
blocks apply and restore. No Samsung defaults are guessed.

## Restore and transfer to another PC

Keep the launcher and its control service available until restore completes:

```sh
aerotizen home restore                                  # offline preview
aerotizen --tv TV_IP home restore --yes
```

For another authorised PC, copy the complete folder containing `original-home.json`
and `transactions/`. Install the updated CLI and allow that PC's IP in the TV's
Developer Mode settings, then use the copied baseline:

```sh
aerotizen home restore --backup /path/to/copied-folder/original-home.json
aerotizen --tv TV_IP home restore --backup /path/to/copied-folder/original-home.json --yes
```

Receipts are read and written beside the selected baseline, including on the new
PC. That folder must be writable. The original device and firmware checks remain
in force. Restore still returns the previous watcher mode after putting the saved
native settings back. Restart the TV fully so Art reloads its original target.
Complete restore before uninstalling the assigned launcher. Keep the PC backup
after uninstall; it is independent of app storage on the TV.

If a restore fails or its reply is lost, inspect `home status` before retrying.
When the service is left on hold, the CLI validates its saved restore requests
back to the original boot apply. Each request must contain the same baseline
bytes and checksum. Missing, invalid, cyclic or excessively long chains refuse
boot recovery before the native writer runs. Preserve all receipts when copying
or backing up this folder.

The small persistent handoff state on the TV is still needed to keep the watcher
disabled across restarts. It is separate from the PC's recovery backup. There is
no app-private backup upload or download command in this flow.
