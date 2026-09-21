const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  await p.goto('https://ring-options.pages.dev/webgi-orbit3?model=./assets/LR-12.glb&metal=%23f0ce6e', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(20000);
  const r = await p.evaluate(() => {
    const audit = window.__meshAudit;
    let a = null;
    try { a = audit(); } catch (e) { a = 'ERR ' + String(e); }
    const env = window.__envState;
    return { audit: a, env: typeof env === 'function' ? (() => { try { return env(); } catch (e) { return 'ERR' + e; } })() : env };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();