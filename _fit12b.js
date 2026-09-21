const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://481da22c.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(2500);
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) { hidden = true; break; }
  }
  await p.waitForTimeout(3000);
  console.log('loaderHidden:', hidden);
  const r = await p.evaluate(() => {
    const out = {};
    try {
      const v = window.webGiViewers && window.webGiViewers[0];
      out.viewers = (window.webGiViewers || []).length;
      if (v && v.scene && v.scene.activeCamera) {
        const cam = v.scene.activeCamera;
        out.camPos = cam.position.toArray().map(n => +n.toFixed(3));
        out.camTarget = cam.target ? cam.target.toArray().map(n => +n.toFixed(3)) : null;
        out.camDist = cam.target ? +(cam.position.distanceTo(cam.target)).toFixed(3) : null;
      }
    } catch (e) { out.err = String(e); }
    const api = window.__ED_api;
    out.apiOk = !!(api && api.metalLib);
    out.loaderText = (document.getElementById('loader')?.innerText || '').replace(/\s+/g,' ').slice(0,80);
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();