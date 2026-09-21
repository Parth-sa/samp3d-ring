const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,200)));
  await p.goto('https://ring-options.pages.dev/webgi-orbit3?model=./assets/LR-12.glb&metal=%23f0ce6e', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(18000);
  const r = await p.evaluate(() => {
    const v = window.__viewer3;
    const env = window.__envState;
    const audit = window.__meshAudit;
    const keys = v ? Object.keys(v).slice(0, 30) : null;
    let loaded = false;
    if (v && v.loaded !== undefined) loaded = v.loaded;
    else if (v && v.isLoaded !== undefined) loaded = v.isLoaded;
    else if (v && v.modelLoaded !== undefined) loaded = v.modelLoaded;
    return { vKeys: keys, loaded, env, audit: typeof audit, bodyText: document.body.innerText.slice(0, 120).replace(/\s+/g, ' ') };
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();