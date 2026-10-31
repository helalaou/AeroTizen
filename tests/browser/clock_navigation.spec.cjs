const { test, expect } = require('@playwright/test');

const errors=new WeakMap();
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
test.beforeEach(async ({page})=>{
  errors.set(page,[]);page.on('pageerror',e=>errors.get(page).push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
  await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
  await page.addInitScript(()=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({background:'black',showWeather:false,home:['demo0','demo1','demo2'],clockLayout:'classic'})));
});

test('clock layout changes update remote navigation before the next directional key',async({page})=>{
  await page.goto('/'); await page.waitForFunction(()=>AeroTizen.apps.ready);
  await page.locator('#gear').click();
  await page.locator('[data-key="clock-layouts:custom"]').click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#editor .focused')).toHaveAttribute('data-key',/^clock-styles:/);
  await page.locator('[data-key="clock-layouts:classic"]').click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#editor .focused')).toHaveAttribute('data-key','time:12');
});


for (const scenario of [
  {locale:'fi-FI',format:'24',hour:'14',minute:'05'},
  {locale:'ko-KR',format:'12',hour:'2',minute:'05'}
]) {
  test.describe('custom clock in '+scenario.locale,()=>{
    test.use({locale:scenario.locale,timezoneId:'UTC'});
    test('keeps localized hour, minute and day-period parts in their own fields',async({page})=>{
      await page.clock.install({time:new Date('2026-10-28T14:05:00Z')});
      await page.addInitScript(format=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({background:'black',showWeather:false,clockLayout:'custom',timeFormat:format})),scenario.format);
      await page.goto('/');
      await expect(page.locator('#aero-v991-hours')).toHaveText(scenario.hour);
      await expect(page.locator('#aero-v991-minutes')).toContainText(scenario.minute);
      const label=await page.locator('.aero-v991-digits').getAttribute('aria-label');
      expect(label).toBe(await page.locator('#time').textContent());
      expect(await page.locator('#aero-v991-minutes small').textContent()).toContain(scenario.format==='12'?'오후':'');
    });
  });
}
