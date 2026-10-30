const {test,expect}=require('@playwright/test');
for(const glassSettings of [false,true]) {
  test(`${glassSettings?'Glass':'Classic'} Continue Watching uses short focus motion and respects reduced motion`,async({page},info)=>{
    await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
    await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
    await page.addInitScript(glassSettings=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({glassSettings,home:['demo0'],background:'black',showWeather:false,continueWatching:true,inputNames:{'HDMI 2':'A long custom HDMI label'}})),glassSettings);
    await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready && AeroTizen.inputs.sources.length===4);
    await page.evaluate(()=>{AeroTizen.continueWatching.items=[{key:'motion',title:'Motion fixture',sourceName:'YouTube',sourceId:'demo0'}];AeroTizen.homeScreen.refreshApps();});
    const card=page.locator('.continue-card');
    expect(await card.evaluate(n=>getComputedStyle(n).transitionProperty)).toBe('transform');
    await expect.poll(()=>card.evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a)).toBeCloseTo(.98,2);
    await page.keyboard.press('ArrowDown');await expect(card).toHaveClass(/focused/);
    await expect.poll(()=>card.evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a)).toBeCloseTo(1.035,2);
    await page.screenshot({path:info.outputPath('continue-focused.png')});
    await page.emulateMedia({reducedMotion:'reduce'});
    expect(await card.evaluate(n=>getComputedStyle(n).transitionProperty)).toBe('none');
  });
}
