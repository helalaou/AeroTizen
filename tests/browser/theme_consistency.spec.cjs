const {test,expect}=require('@playwright/test');
for(const glassSettings of [false,true]) {
  test(`${glassSettings?'Glass':'Classic'} theme covers Home, inputs, Continue Watching and uniform Settings choices`,async({page},info)=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
    await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
    await page.addInitScript(glassSettings=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({glassSettings,home:['demo0','demo1'],background:'black',showWeather:false,continueWatching:true})),glassSettings);
    await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready);
    await page.evaluate(()=>{
      AeroTizen.continueWatching.items=[{key:'theme-fixture',title:'Theme fixture',sourceName:'YouTube',sourceId:'demo0',season:1,episode:1,duration:300,playback:75}];
      AeroTizen.inputs.sources=[{type:'HDMI',number:1,connected:true}];
      AeroTizen.homeScreen.refreshApps();
    });
    const colour=glassSettings?'rgb(237, 242, 255)':'rgb(124, 92, 255)';
    expect(await page.locator('#grid .tile.focused').evaluate(n=>getComputedStyle(n).boxShadow)).toContain(colour);
    await page.keyboard.down('Enter');await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.up('Enter');
    expect(await page.locator('.tile-actions-glider').evaluate(n=>getComputedStyle(n).borderColor)).toBe(colour);
    expect(await page.getByRole('menu').evaluate(n=>getComputedStyle(n).backgroundImage==='none')).toBe(!glassSettings);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.continue-card')).toHaveClass(/focused/);
    expect(await page.locator('.continue-card').evaluate(n=>getComputedStyle(n).boxShadow)).toContain(colour);
    expect(await page.locator('.continue-progress-fill').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe(colour);
    expect(await page.locator('.continue-card').evaluate(n=>getComputedStyle(n).backgroundImage)).toBe(glassSettings? 'linear-gradient(160deg, rgba(86, 97, 116, 0.84), rgba(22, 29, 42, 0.94))':'none');
    await page.keyboard.press('ArrowDown');
    const source=page.locator('#inputs .focused');await expect(source).toHaveCount(1);
    expect(await source.evaluate(n=>getComputedStyle(n).boxShadow+' '+getComputedStyle(n).borderColor)).toContain(glassSettings?'255, 255, 255':'124, 92, 255');
    await page.locator('#gear').click();await page.locator('[data-key="section:appearance"]').click();
    const choices=await page.locator('[data-section-pane="appearance"] .pill.unit').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height).map(n=>({height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize,minWidth:getComputedStyle(n).minWidth})));
    expect(choices.length).toBeGreaterThan(3);
    for(const choice of choices){expect(choice.height).toBeGreaterThanOrEqual(64);expect(choice.height).toBeLessThanOrEqual(76);expect(choice.font).toBe('20px');expect(choice.minWidth).toBe('160px');}
    await page.screenshot({path:info.outputPath('settings-control-scale.png')});
    await page.locator('[data-key="section:status"]').click();
    const custom=page.locator('[data-key="clock-layouts:custom"]');if(await custom.count())await custom.click();
    const statusChoices=await page.locator('[data-section-pane="status"] .pill.unit').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height).map(n=>({height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize})));
    for(const choice of statusChoices){expect(choice.height).toBeGreaterThanOrEqual(64);expect(choice.height).toBeLessThanOrEqual(76);expect(choice.font).toBe('20px');}
    await page.screenshot({path:info.outputPath('status-control-scale.png')});
    await page.locator('[data-key="section:apps"]').click();
    const icons=await page.locator('#all-apps > .tile').evaluateAll(nodes=>nodes.map(n=>[n.offsetWidth,n.offsetHeight]));
    for(const size of icons)expect(size).toEqual([160,160]);
    await page.screenshot({path:info.outputPath('settings-standard-icons.png')});
    expect(errors).toEqual([]);
  });
}
