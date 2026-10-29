const { test, expect } = require('@playwright/test');
for (const glassSettings of [false]) {
  for(const style of ['vertical','horizontal','minimal','bold']) {
    test(`${glassSettings ? 'Glass' : 'Classic'} ${style} clock clears focused apps, centres tabs and fades only scrolled content`,async({page},info)=>{
      await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
      await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
      await page.addInitScript(({glassSettings,style})=>{
        localStorage.setItem('aerotizen.settings.v1',JSON.stringify({glassSettings,clockLayout:'custom',aeroClockStyle:style,home:Array.from({length:12},(_,i)=>'demo'+i),background:'black',showWeather:true}));
        localStorage.setItem('aerotizen.weather.v2',JSON.stringify({temp:20,code:3,day:1,at:Date.parse('2026-10-29T10:20:00Z'),unit:'C',source:'auto',city:'A very long fixture city name'}));
      },{glassSettings,style});
      await page.clock.setFixedTime(new Date('2026-10-29T10:20:00Z'));
      await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready);
      await expect(page.locator('#aero-v991-city')).toBeVisible();
      await expect(page.locator('#rows')).toHaveCSS('padding-top','24px');
      const measure=()=>page.evaluate(()=>{
        const city=document.querySelector('#aero-v991-widget').getBoundingClientRect();
        const card=document.querySelector('#grid .tile.focused').getBoundingClientRect();
        const tabs=document.querySelector('.view-tabs').getBoundingClientRect();
        return {gap:card.top-city.bottom,centre:tabs.left+tabs.width/2};
      });
      await expect.poll(async()=>(await measure()).gap).toBeGreaterThan(35);
      expect((await measure()).centre).toBeCloseTo(960,0);
      const headerHeight = await page.locator('.topbar').evaluate(n=>Math.floor(Math.min(n.getBoundingClientRect().height-1,350)));
      const headerBefore = await page.screenshot();
      await page.screenshot({path:info.outputPath('clock-clearance.png')});
      await expect(page.locator('.content-viewport')).not.toHaveClass(/is-scrolled/);
      await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
      await expect(page.locator('.content-viewport')).toHaveClass(/is-scrolled/);
      expect(await page.locator('#aero-v991-city').textContent()).toContain('fixture city');
      const headerAfter = await page.screenshot();
      const unchanged = await page.evaluate(async ({images,height}) => {
        const pixels = async data => {
          const image = new Image(); image.src = 'data:image/png;base64,' + data;
          await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
          const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=height;
          const context=canvas.getContext('2d');context.drawImage(image,0,0);
          return context.getImageData(0,0,1920,height).data;
        };
        const [before,after]=await Promise.all(images.map(pixels));
        return before.every((value,index)=>value===after[index]);
      },{images:[headerBefore.toString('base64'),headerAfter.toString('base64')],height:headerHeight});
      expect(unchanged,'the scrolled viewport must not fade the header pixels').toBe(true);
      await page.screenshot({path:info.outputPath('scroll-fade.png')});
      expect(await page.locator('.content-viewport').evaluate(n=>getComputedStyle(n).webkitMaskImage)).toContain('linear-gradient');
      await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
      await expect(page.locator('.content-viewport')).not.toHaveClass(/is-scrolled/);
    });
  }
}
