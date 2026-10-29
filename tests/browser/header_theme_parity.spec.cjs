const {test,expect}=require('@playwright/test');
for(const clockLayout of ['classic','custom']){
 test(`${clockLayout} header keeps tab and Samsung Home geometry across appearance changes`,async({page},info)=>{
  await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
  await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
  await page.addInitScript(clockLayout=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({clockLayout,home:['demo0'],background:'black',showWeather:false})),clockLayout);
  await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready);
  const geometry=()=>page.evaluate(()=>['.view-tabs','#home-tab','#apps-tab','#gear','#samsung-home-shortcut','#network'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,...[r.x,r.y,r.width,r.height].map(Math.round)];}));
  await page.locator('#apps-tab').click();await page.locator('#home-tab').click();
  const before=await geometry();
  const tabs=await page.locator('.view-tabs').boundingBox();expect(tabs.x+tabs.width/2).toBeCloseTo(960,0);
  await expect(page.locator('#samsung-home-shortcut')).toBeVisible();
  for(const glass of [true,false,true]){
   await page.locator('#gear').click();await page.locator('[data-key="section:appearance"]').click();
   await expect(page.getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);
   await page.locator(`[data-key="settings-appearance:${glass}"]`).click();
   await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   expect(await geometry()).toEqual(before);
   await expect(page.locator('#samsung-home-shortcut')).toBeVisible();
   expect(await page.locator('#aero-tab-glider').evaluate(n=>getComputedStyle(n).transitionProperty)).toContain('transform');
   await page.screenshot({path:info.outputPath(`${glass?'glass':'classic'}-header.png`)});
  }
 });
}
