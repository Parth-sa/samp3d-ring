const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://44a4f366.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3000);
  await p.waitForURL(/ring-editor/, { timeout: 30000 });
  for (let i = 0; i < 20; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    let px = null;
    if (c) { const g = c.getContext('webgl2') || c.getContext('webgl'); if (g) { const d = new Uint8Array(4); g.readPixels(2, 2, 1, 1, g.RGBA, g.UNSIGNED_BYTE, d); px = Array.from(d); } }
    const api = window.__ED_api;
    let metalInfo = null, mats = [];
    try {
      const e = document.getElementById('editor-app');
      const sel = e && e.querySelector('select[data-prop="metalLib"], select');
      metalInfo = sel ? sel.value : null;
    } catch (e2) {}
    return { url: location.search, cls: document.documentElement.className, loaderHidden: !!document.getElementById('loader')?.classList.contains('hidden'), pxTL: px, apiOk: !!(api && api.metalLib && api.bg), canvas: c ? [c.width, c.height] : null };
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();