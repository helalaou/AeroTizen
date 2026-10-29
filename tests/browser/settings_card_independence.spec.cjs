const {test,expect}=require('@playwright/test');
test('Home card shape and columns never change standard Settings icons or artwork nodes',async({page})=>{
  await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
  await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
  await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready);
  await page.locator('#gear').click();
  const category=async id=>{const entry=page.locator(`[data-key="section:${id}"]`);if(await entry.count())await entry.click();};
  await category('apps');
  const before=await page.locator('#all-apps > .tile').evaluateAll(nodes=>nodes.map(n=>[n.offsetWidth,n.offsetHeight]));
  for(const size of before)expect(size[0]).toBe(size[1]);
  await page.evaluate(()=>{window.settingsIconNodes=Array.from(document.querySelectorAll('#all-apps > .tile'));});
  await category('appearance');
  await expect(page.locator('#card-sizes')).toBeVisible();
  await page.locator('[data-key="card-sizes:small"]').click();
  for(const columns of ['3','4','5']) {
    await page.locator(`[data-key="home-card-columns:${columns}"]`).click();
    await expect(page.locator('#card-sizes')).toHaveCount(0);
  }
  await page.locator('[data-key="home-card-columns:auto"]').click();
  await expect(page.locator('#card-sizes')).toBeVisible();
  expect(await page.evaluate(()=>AeroTizen.settings.cardSize)).toBe('small');
  await page.locator('[data-key="card-sizes:big"]').click();
  expect(await page.evaluate(()=>AeroTizen.settings.cardSize)).toBe('big');
  for(const mode of ['rectangle','square']){
    await category('appearance');
    await page.locator(`[data-key="home-card-mode:${mode}"]`).click();
    await page.locator('[data-key="home-card-columns:4"]').click();
    await category('apps');
    expect(await page.locator('#all-apps > .tile').evaluateAll(nodes=>nodes.map(n=>[n.offsetWidth,n.offsetHeight]))).toEqual(before);
    expect(await page.evaluate(()=>settingsIconNodes.every((node,i)=>node===document.querySelectorAll('#all-apps > .tile')[i]))).toBe(true);
  }
});
