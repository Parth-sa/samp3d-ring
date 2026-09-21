const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://481da22c.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 20; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    let out = { fitVisRead: null, camDist: null, fitDistance: null, hasFit: null };
    try {
      const v = window.webGiViewers && window.webGiViewers[0];
      if (v) {
        const cam = v.scene.activeCamera;
        if (cam) out.camDist = +cam.position.distanceTo(cam.target).toFixed(3);
        if (v.scene.modelRoot && v.scene.modelRoot.modelObject) {
          const root = v.scene.modelRoot.modelObject;
          const Box3 = { empty: false };
          out.hasFit = true;
        }
      }
    } catch (e) {}
    const api = window.__ED_api;
    out.apiOk = !!(api && api.metalLib && api.bg);
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();