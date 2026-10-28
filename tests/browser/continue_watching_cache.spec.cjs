const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

// Do not use page.route here: routing disables the browser's HTTP cache.
async function fixture(page, initialRecords) {
  const source = await fs.readFile(path.join(__dirname, '../../launcher/js/continue-watching.js'), 'utf8');
  const requests = [];
  let origin, records = initialRecords;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, origin);
    if (url.pathname === '/feed') {
      const id = request.headers.app_id;
      requests.push({ id, url: request.url });
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' });
      response.end(JSON.stringify(records(id)));
    } else if (url.pathname === '/reader.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(source.replace('http://localhost:9013/?module=EBHelper&func=GetItems', origin + '/feed?module=EBHelper&func=GetItems'));
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<!doctype html><title>Continue Watching cache regression</title><div id="items"></div><script>
        var listeners = [], completed = 0;
        var send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function () {
          this.addEventListener('loadend', function () { completed++; });
          return send.apply(this, arguments);
        };
        window.AeroTizen = {
          config: { HIDDEN_APPS: /hidden/ },
          apps: { inventory: [{ id: 'prime', packageId: 'prime', name: 'Prime' },
            { id: 'youtube', packageId: 'youtube', name: 'YouTube' }], ready: true, subscribe: function () {} },
          settings: { continueWatching: true, continueWatchingApps: ['prime'], subscribe: function (fn) { listeners.push(fn); } },
          catalog: { storeId: function (id) { return id === 'prime' ? '123' : '456'; } },
          tiles: { shortName: function (name) { return name; } },
          tizen: { application: { getAppMetaData: function () {
            return [{ key: 'http://samsung.com/tv/metadata/app_support_continue_watching', value: 'true' }];
          } } }
        };
        function select(sources) { AeroTizen.settings.continueWatchingApps = sources; listeners.forEach(function (fn) { fn(); }); }
        function stop() { AeroTizen.settings.continueWatching = false; listeners.forEach(function (fn) { fn(); }); }
      </script><script src="/reader.js"></script><script>
        AeroTizen.continueWatching.subscribe(function () {
          var target = document.getElementById('items'); target.textContent = '';
          AeroTizen.continueWatching.items.forEach(function (item) {
            var node = document.createElement('p'); node.textContent = item.title; target.appendChild(node);
          });
        });
        AeroTizen.continueWatching.start();
      </script>`);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  return { requests, url: origin, setRecords: next => { records = next; },
    async close() {
      await page.evaluate(() => stop()).catch(() => {});
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
const record = id => ({ app_id: id, content_id: 'item-' + id, content_title: id === '123' ? 'Prime programme' : 'YouTube programme',
  payload: 'launch-data', timestamp: 1000 });

test('a cached response for one app cannot replace another app’s feed', async ({ page }) => {
  const feed = await fixture(page, id => [record(id)]);
  try {
    await page.goto(feed.url);
    await expect(page.locator('#items p')).toHaveText(['Prime programme']);
    await page.evaluate(() => select(['prime', 'youtube']));
    await expect(page.locator('#items p')).toHaveText(['Prime programme', 'YouTube programme']);
    expect(feed.requests.some(request => request.id === '456')).toBe(true);
    expect(new Set(feed.requests.map(request => request.url)).size).toBe(feed.requests.length);
  } finally { await feed.close(); }
});

test('an empty response cached during startup cannot hide later records', async ({ page }) => {
  await page.clock.install();
  const feed = await fixture(page, () => []);
  try {
    await page.goto(feed.url);
    await page.waitForFunction(() => completed === 1);
    feed.setRecords(id => [record(id)]);
    await page.clock.fastForward(2000);
    await expect(page.locator('#items p')).toHaveText(['Prime programme']);
    expect(feed.requests).toHaveLength(2);
    expect(feed.requests[0].url).not.toBe(feed.requests[1].url);
  } finally { await feed.close(); }
});
