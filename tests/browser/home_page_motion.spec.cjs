const {test,expect}=require('@playwright/test');
for(const glassSettings of [false,true]) {
  test(`${glassSettings?'Glass':'Classic'} page reveals preserve cached artwork and accept immediate remote input`,async({page})=>{
    await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
    await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
    await page.addInitScript(glassSettings=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({glassSettings,home:['demo0','demo1','demo2','demo3'],background:'black',showWeather:false})),glassSettings);
    await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready);
    await page.evaluate(()=>{window.savedHomeCard=document.querySelector('#grid > .tile');});
    expect(await page.locator('#aero-tab-glider').evaluate(n=>getComputedStyle(n).transitionProperty)).toBe('none');
    await page.locator('#apps-tab').click();
    await expect(page.locator('.home-page-surface')).toHaveCSS('animation-name','aero-page-apps');
    expect(await page.locator('#aero-tab-glider').evaluate(n=>getComputedStyle(n).transitionProperty)).toContain('transform');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#grid > .tile').first()).toHaveClass(/focused/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.home-page-surface')).toHaveCSS('animation-name','aero-page-home');
    expect(await page.evaluate(()=>savedHomeCard===document.querySelector('#grid > .tile'))).toBe(true);
    for(let i=0;i<3;i++){
      await page.locator('#apps-tab').click();await page.keyboard.press('Escape');
    }
    await expect(page.locator('#home-tab')).toHaveClass(/focused/);
    await expect(page.locator('#grid > .tile')).toHaveCount(4);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#samsung-home-shortcut')).toHaveClass(/focused/);
    await page.evaluate(()=>{window.samsungEscapes=0;AeroTizen.homewatch.openSamsungHome=()=>{samsungEscapes++;};});
    await page.keyboard.press('Enter');expect(await page.evaluate(()=>samsungEscapes)).toBe(1);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('#apps-tab').click();
    await expect(page.locator('.home-page-surface')).toHaveCSS('animation-name','none');
  });
}
