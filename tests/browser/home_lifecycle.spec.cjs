const { test, expect } = require('@playwright/test');

const errors=new WeakMap();
test.afterEach(async({page})=>expect(errors.get(page)).toEqual([]));
test.beforeEach(async ({page})=>{
  errors.set(page,[]);page.on('pageerror',e=>errors.get(page).push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'{}'}));
  await page.route('http://127.0.0.1:47790/**',r=>r.fulfill({body:'{}'}));
  await page.addInitScript(()=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({background:'black',showWeather:false,home:['demo0','demo1','demo2'],clockLayout:'classic'})));
});

test('held OK is cancelled if the app loses visibility before its release',async({page})=>{
  await page.goto('/'); await page.waitForFunction(()=>AeroTizen.apps.ready);
  await page.keyboard.down('Enter');
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    AeroTizen.homeScreen.refreshApps();
  });
  await expect(page.locator('#home-root .focused')).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(page.getByRole('menu')).toBeHidden();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.up('Enter');
  await expect(page.getByRole('menu')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('Would open YouTube');
});

test('moving visible favourites ignores stale uninstalled IDs in saved settings',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('aerotizen.settings.v1',JSON.stringify({background:'black',showWeather:false,home:['demo0','missing.app','demo1','demo2']})));
  await page.goto('/'); await page.waitForFunction(()=>AeroTizen.apps.ready);
  await expect(page.locator('#grid > .tile')).toHaveCount(3);
  await page.keyboard.down('Enter'); await expect(page.getByRole('menu')).toBeVisible(); await page.keyboard.up('Enter');
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight');
  expect(await page.locator('#grid > .tile').evaluateAll(nodes=>nodes.map(n=>n.dataset.id))).toEqual(['demo1','demo0','demo2']);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>AeroTizen.settings.home)).toEqual(['demo1','demo0','demo2']);
});

test('an inventory refresh removing the moving app cannot delete another favourite',async({page})=>{
  await page.goto('/'); await page.waitForFunction(()=>AeroTizen.apps.ready);
  await page.keyboard.down('Enter'); await expect(page.getByRole('menu')).toBeVisible(); await page.keyboard.up('Enter');
  await page.keyboard.press('Enter'); await expect(page.locator('#grid .tile.moving')).toHaveCount(1);
  await page.evaluate(()=>{AeroTizen.apps.all=AeroTizen.apps.all.filter(app=>app.id!=='demo0');AeroTizen.homeScreen.refreshApps();});
  await expect(page.locator('#grid .tile.moving')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(()=>AeroTizen.settings.home)).toEqual(['demo0','demo1','demo2']);
  expect(await page.locator('#grid > .tile').evaluateAll(nodes=>nodes.map(n=>n.dataset.id))).toEqual(['demo1','demo2']);
});

test('source reachability keeps active, recognised and manually pinned inputs distinct from an empty port',async({page})=>{
  await page.goto('/');await page.waitForFunction(()=>AeroTizen.apps.ready);
  await page.evaluate(()=>{
    AeroTizen.inputs.sources=[1,2,3,4].map(number=>({type:'HDMI',number,connected:false,active:number===1}));
    AeroTizen.inputs.isVisible=()=>true;
    AeroTizen.inputs.hasRecognizedDevice=source=>source.number===2;
    AeroTizen.inputs.alwaysVisible=source=>source.number===3;
    AeroTizen.inputs.render();
  });
  const sources=page.locator('#inputs > .tile');
  await expect(sources).toHaveCount(4);
  for(let i=0;i<3;i++)await expect(sources.nth(i)).not.toHaveClass(/\boff\b/);
  await expect(sources.nth(3)).toHaveClass(/\boff\b/);
});
