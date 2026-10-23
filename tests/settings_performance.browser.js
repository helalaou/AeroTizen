// Local browser CPU/heap comparison; synthetic events, not TV or physical remote latency.
async page => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('https://**/*', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  const preactUrl = page.url();
  const samples = [];
  const cdp = await page.context().newCDPSession(page);
  for (let round = 0; round < 5; round++) {
    for (const variant of round % 2 ? ['preact', 'baseline'] : ['baseline', 'preact']) {
      const url = variant === 'preact' ? preactUrl : 'http://127.0.0.1:8020/';
      await page.goto(url);
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('aerotizen.settings.v1', JSON.stringify({ background: 'black', speed: 1,
          home: ['__fire','111299001912','11101200001','3201512006785','111399000083','3201606009684'],
          inputNames: {}, tempUnit: 'C', timeFormat: '24', dateFormat: 'short' }));
      });
      await page.reload();
      await page.waitForFunction(() => window.AeroTizen && AeroTizen.apps.all.length > 0);
      const timing = await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const A = AeroTizen;
        const duration = fn => { const start = performance.now(); fn(); return performance.now() - start; };
        const firstOpenMs = duration(() => A.settingsUi.open());
        const reopenMs = [], changeMs = [], keyMs = [];
        for (let i = 0; i < 25; i++) {
          A.settingsUi.close();
          reopenMs.push(duration(() => A.settingsUi.open()));
          changeMs.push(duration(() => document.querySelector('[data-key="time:' + (i % 2 ? '12' : '24') + '"]').click()));
        }
        for (let i = 0; i < 100; i++) {
          keyMs.push(duration(() => A.settingsUi.keydown(i % 2 ? A.config.KEY.UP : A.config.KEY.DOWN, { preventDefault() {} })));
        }
        return { firstOpenMs, reopenMs, changeMs, keyMs,
          inventory: A.apps.all.map(app => ({ id: app.id, name: app.name, icon: app.icon })) };
      });
      await cdp.send('HeapProfiler.collectGarbage');
      const { usedSize } = await cdp.send('Runtime.getHeapUsage');
      samples.push({ round, variant, ...timing, retainedHeapBytes: usedSize });
    }
  }
  const stats = values => {
    const sorted = [...values].sort((a,b) => a-b);
    return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], count: values.length };
  };
  const summary = {};
  for (const variant of ['baseline','preact']) {
    const rows = samples.filter(row => row.variant === variant);
    summary[variant] = {};
    for (const metric of ['firstOpenMs','reopenMs','changeMs','keyMs','retainedHeapBytes']) {
      summary[variant][metric] = stats(rows.flatMap(row => row[metric]));
    }
  }
  const sameInventory = samples.every(row => JSON.stringify(row.inventory) === JSON.stringify(samples[0].inventory));
  if (!sameInventory) throw new Error('Inventory mismatch');
  const output = { environment: await page.context().browser().version(), viewport: '1920x1080',
    background: 'black', rounds: 5, sameInventory, samples, summary };
  return output;
}
