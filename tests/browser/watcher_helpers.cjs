// Healthy replies for fixtures that do not test service startup or recovery.
function watcherStatus(requestUrl) {
  const url = new URL(requestUrl);
  return {
    homeControl: { protocol: 1, app_id: "DclHome001.Home", mode: "watcher" },
    heartbeats: 1,
    leaving: url.pathname === "/leave",
    watched: url.pathname === "/watch" ? url.searchParams.get("id") : null,
  };
}

module.exports = { watcherStatus };
