const {test,expect}=require('@playwright/test');
for(const glassSettings of [false,true]) {
  test(`${glassSettings?'Glass':'Classic'} HDMI names remain inside their control and save correctly`,async({page},info)=>{
    await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
    await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
    await page.addInitScript(glassSettings=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({glassSettings,home:['demo0'],background:'black',showWeather:false,continueWatching:true,inputNames:{'HDMI 2':'A long custom HDMI label'}})),glassSettings);
    await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready && AeroTizen.inputs.sources.length===4);
    await page.locator('#gear').click();await page.locator('[data-key="section:sources"]').click();
    const fields=page.locator('#input-names input');await expect(fields).toHaveCount(3);
    for(const input of await fields.all()) {
      const bounds=await input.evaluate(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect(),label=n.previousElementSibling.getBoundingClientRect();return {inside:a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom,clear:a.left>=label.right,width:a.width};});
      expect(bounds.inside).toBe(true);expect(bounds.clear).toBe(true);expect(bounds.width).toBeGreaterThan(100);
    }
    await page.getByRole('textbox',{name:'HDMI 2 name',exact:true}).fill('Updated console');
    await page.getByRole('textbox',{name:'HDMI 2 name',exact:true}).press('Tab');
    await expect.poll(()=>page.evaluate(()=>AeroTizen.settings.inputNames['HDMI 2'])).toBe('Updated console');
    await page.screenshot({path:info.outputPath('hdmi-name-fields.png')});
  });
}
