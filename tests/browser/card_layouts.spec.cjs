const {test,expect}=require('@playwright/test');
// Each geometry has its own timeout and reload check; no shared test state or longer deadline.
for(const mode of ['square','rectangle'])for(const columns of [3,4,5]){
 test(`${mode} ${columns} columns retain artwork sources, remote navigation and persistence`,async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
  await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
  await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready);
  await page.locator('#gear').click();
  const category=page.locator('[data-key="section:appearance"]');
  const drawer=await category.count();if(drawer)await category.click();
  await page.locator(`[data-key="home-card-mode:${mode}"]`).click();
  await page.locator(`[data-key="home-card-columns:${columns}"]`).click();
  if(drawer)await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.locator('#home-tab').click();await page.locator('#apps-tab').click();
  await expect(page.locator('#grid')).toHaveClass(new RegExp('cards-'+mode));
  const tiles=page.locator('#grid > .tile');
  const positions=await tiles.evaluateAll(nodes=>nodes.slice(0,6).map(n=>({top:n.offsetTop,width:n.offsetWidth,height:n.offsetHeight})));
  expect(positions.filter(p=>p.top===positions[0].top)).toHaveLength(columns);
  if(mode==='rectangle')expect(positions[0].width/positions[0].height).toBeCloseTo(576/300,1);
  await page.keyboard.press('ArrowDown');await expect(tiles.first()).toHaveClass(/focused/);
  await page.keyboard.press('ArrowDown');await expect(tiles.nth(columns)).toHaveClass(/focused/);
  await page.screenshot({path:info.outputPath(`${mode}-${columns}.png`)});
  await page.reload();
  expect(await page.evaluate(()=>[AeroTizen.settings.homeCardMode,AeroTizen.settings.homeCardColumns])).toEqual([mode,columns]);
  expect(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('/assets/brands/')))).toBe(false);
  expect(errors).toEqual([]);
 });
}
