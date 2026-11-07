# Set up with an AI assistant

An assistant with terminal access can find your TV and run the CLI. Use the remote
to enable Developer Mode, disconnect power as instructed, sign in to Samsung in
your browser, and check what appears on the TV.

Turn on the TV and connect your computer to the same network. Paste the following
prompt into your assistant. To include Stremio, change the last line to
`Goal: install the launcher and set up Stremio in Continue Watching.`
See [Stremio requirements](launcher.md#stremio) and [root setup and upgrades](root-cli.md).

```text
Help me set up AeroTizen on my Samsung TV.
Repository: https://github.com/helalaou/AeroTizen

1. Read Quick Start in the README. Check the TV compatibility guide and tell me
   if a reported limit affects my model.
2. Find my operating system, CPU, and local IP address. Download and extract the
   matching stable CLI (cli-v...) into a new folder. Check that CLI 3.0.0 and
   launcher 2.7.0 or newer are available. Tell me if either is still pending.
3. Run "aerotizen discover". If it finds multiple TVs, ask which one to use. If it
   finds none, ask me for the IP address in the TV's network settings. Put
   "--tv TV_IP" before the command for the selected TV.
4. Tell me the exact Host PC IP to enter in Developer Mode and when to disconnect
   power. Confirm that "status" shows developerMode=1 and a developer connection.
   Tell me when to sign in to Samsung or check the screen.
5. If my goal includes Native Home, follow the Home guide for the downloaded CLI
   version. Save the original Home settings before the first launcher launch.
6. Before removing apps or changing Home or root settings, show me the proposed
   change and wait for my approval. For debloat and uninstall, answering "y"
   applies the change. For Home and root changes, omit --yes to preview.
7. If my goal includes Stremio in Continue Watching, check that Stremio is
   installed. Follow docs/root-cli.md to set up root or upgrade an older paired
   helper. Guide me through the TV steps and use "root status" to confirm the
   helper is active after a full restart. Then help me turn on Settings → Apps →
   Continue Watching and select Stremio.
8. If a step fails, show me the exact error and check the linked guides before
   trying a workaround. If the TV stops responding, check whether its IP changed.

Goal: install the launcher and use the default watcher.
```
