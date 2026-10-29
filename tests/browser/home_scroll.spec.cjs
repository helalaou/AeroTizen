const {test,expect}=require('@playwright/test');
test('Home scroll fades at the fixed viewport edge and clears the mask on return',async({page})=>{
  await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
  await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
  await page.addInitScript(()=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({home:Array.from({length:12},(_,i)=>'demo'+i),background:'black',showWeather:false})));
  await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready);
  const viewport=page.locator('.content-viewport');
  await expect(viewport).not.toHaveClass(/is-scrolled/);
  const top=await viewport.evaluate(n=>n.getBoundingClientRect().top);
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
  await expect(viewport).toHaveClass(/is-scrolled/);
  expect(await viewport.evaluate(n=>getComputedStyle(n).webkitMaskImage)).toContain('linear-gradient');
  expect(await viewport.evaluate(n=>n.getBoundingClientRect().top)).toBe(top);
  expect(await page.locator('.topbar').evaluate(n=>n.getBoundingClientRect().top)).toBe(0);
  await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
  await expect(viewport).not.toHaveClass(/is-scrolled/);
});
