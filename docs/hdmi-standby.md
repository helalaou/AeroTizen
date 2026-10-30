# Recognised HDMI devices in standby

Updates PR #29 for current upstream and Preact Settings. Samsung's device name,
connection/signal state and selected source are evidence of a device. Custom
launcher labels alone are not. Connected duplicate records win, retaining a
recognised name from the alternate record. Source switching and native Live TV
handoffs remain upstream operations.

Settings > Keep HDMI ports visible provides Automatic/Always show per port, using
`hdmiKeepVisible` from the earlier contribution. These controls are TSX, participate
in existing ref-based D-pad navigation and persist through the shared settings store.

Node fixtures cover placeholder filtering, duplicates, selected ports, manual overrides
and settings persistence. The browser regression exercises compiled controls, custom
labels, standby filtering and reload persistence. The adapted build still requires
physical S90C validation, especially firmware-specific VIDEOSOURCE names and hot-plug.
No TV has been contacted by the development/test suite.

Manual visibility is reachability rather than evidence of a live signal. A pinned
port remains undimmed as in the reference, while its native disconnected state is
unchanged. The Preact dock may label it PINNED; a configured Samsung label is
RECOGNISED, not proof that a device is physically connected or actually asleep.
