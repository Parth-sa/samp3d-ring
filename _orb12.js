const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://ring-options.pages.dev/webgi-orbit3?model=./assets/LR-12.glb&metal=%23f0ce6e', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 25; i++) {
    const s = await p.evaluate(() => window.__viewer3 && window.__viewer3.getState && window.__viewer3.getState());
    if (s && s.loaded) break;
    await p.waitForTimeout(2500);
  }
  const s = await p.evaluate(() => window.__viewer3 && window.__viewer3.getState ? window.__viewer3.getState() : { loaded: false });
  console.log('state:', JSON.stringify(s));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();