const assert = require("node:assert/strict");
const { test } = require("node:test");

const { loadTypeScript } = require("./helpers/load_typescript.cjs");

const { normalizeContinueItems } = loadTypeScript("launcher/src/services/continueWatching/normalizeItems.ts");
const { createCinemetaBackdropLookup } = loadTypeScript(
  "launcher/src/services/continueWatching/createCinemetaBackdropLookup.ts",
);

const prime = { id: "org.tizen.primevideo", storeId: "1", name: "Prime Video" };
const stremio = { id: "stremio.app", storeId: "2", name: "Stremio", supportsSeparateBackdrop: true };
const youtube = { id: "youtube.app", storeId: "3", name: "YouTube" };
const cardImage = "https://artwork.test/episode.jpg";
const backdrop = (id) => `https://images.metahub.space/background/medium/${id}/img`;
const feedItem = (fields, app = prime) =>
  normalizeContinueItems(
    app,
    [
      {
        app_id: app.storeId,
        content_id: "provider-id",
        content_title: "A Show",
        image_url: cardImage,
        season: 1,
        episode: 2,
        payload: "watch",
        ...fields,
      },
    ],
    0,
  )[0];

const settle = () => new Promise((resolve) => setImmediate(resolve));

function harness({ now, storage } = {}) {
  let next = 0;
  const timers = new Map();
  const requests = [];
  const states = [];
  const lookup = createCinemetaBackdropLookup({
    now,
    storage,
    excludedSourceIds: new Set([youtube.id]),
    timers: {
      setTimeout(callback) {
        timers.set(++next, callback);
        return next;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    createRequest: () => ({
      open(method, url) {
        Object.assign(this, { method, url });
      },
      send() {
        requests.push(this);
      },
      abort() {
        this.aborted = true;
        this.onabort();
      },
      respond(payload) {
        Object.assign(this, { status: 200, responseText: JSON.stringify(payload) });
        this.onload();
      },
    }),
  });
  return {
    requests,
    states,
    watch: (item) => lookup.watch(item, (state) => states.push(state)),
    tick() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

test("Stremio resolves its IMDb ID and keeps the original card thumbnail", async () => {
  const id = "tt1234567";
  const item = feedItem({ content_id: id, content_title: "A title with a truncated character \uD83D" }, stremio);
  const h = harness();
  h.watch(item);
  h.tick();
  assert.equal(h.requests[0].url, `https://v3-cinemeta.strem.io/meta/series/${id}.json`);
  h.requests[0].respond({ meta: { id, background: backdrop(id) } });
  await settle();

  assert.deepEqual(h.states.at(-1), { status: "ready", url: backdrop(id) });
  assert.equal(item.image, cardImage);
});

test("Prime uses the feed year to identify a remake and reuses the match with the original expiry", async () => {
  const asset = backdrop("tt7654321");
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const lifetimeMs = 30 * 24 * 60 * 60 * 1000;
  let now = 1_700_000_000_000;
  const first = harness({ now: () => now, storage });
  first.watch(feedItem({ release: "2026" }));
  first.tick();
  assert.equal(first.requests[0].url, "https://v3-cinemeta.strem.io/catalog/series/top/search=A%20Show.json");
  first.requests[0].respond({
    metas: [
      { name: "A Show", releaseInfo: "2016", background: backdrop("tt9876543") },
      { name: "A Show", releaseInfo: "2026–", background: asset },
    ],
  });
  await settle();
  assert.deepEqual(first.states.at(-1), { status: "ready", url: asset });

  now += lifetimeMs - 1;
  const otherEpisode = feedItem({ content_id: "sibling-episode", release: 2026 });
  const warm = harness({ now: () => now, storage });
  warm.watch(otherEpisode);
  warm.tick();
  assert.deepEqual(warm.states, [{ status: "ready", url: asset }]);
  assert.equal(warm.requests.length, 0);

  now++;
  const expired = harness({ now: () => now, storage });
  expired.watch(otherEpisode);
  expired.tick();
  assert.deepEqual(expired.states, [{ status: "pending" }]);
  assert.equal(expired.requests.length, 1);
});

test("an unknown media kind checks both catalogues and rejects titles that match both", async () => {
  const h = harness();
  const item = feedItem({ season: 0, episode: 0 });
  h.watch(item);
  h.tick();
  assert.deepEqual(
    h.requests.map(({ url }) => new URL(url).pathname),
    ["/catalog/movie/top/search=A%20Show.json", "/catalog/series/top/search=A%20Show.json"],
  );
  h.requests[0].respond({ metas: [{ name: item.title, background: backdrop("tt1234567") }] });
  h.requests[1].respond({ metas: [{ name: item.title, background: backdrop("tt7654321") }] });
  await settle();

  assert.deepEqual(h.states.at(-1), { status: "ready", url: undefined });
});

test("a blank title without an IMDb ID makes no catalogue request", () => {
  const h = harness();
  h.watch(feedItem({ content_title: "   " }));
  h.tick();

  assert.deepEqual(h.states, [{ status: "ready" }]);
  assert.equal(h.requests.length, 0);
});

test("focus changes cancel old requests and YouTube keeps its own artwork", async () => {
  const h = harness();
  h.watch(feedItem());
  h.tick();
  h.watch(feedItem({}, youtube));
  h.tick();
  assert.ok(h.requests[0].aborted);
  assert.equal(h.requests.length, 1);

  h.requests[0].respond({ metas: [{ name: "A Show", background: backdrop("tt1234567") }] });
  await settle();
  assert.deepEqual(h.states, [{ status: "pending" }, { status: "ready" }]);
});
