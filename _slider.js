const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://51759fe8.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(2500);
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) { hidden = true; break; }
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const out = { loaderHidden: !!document.getElementById('loader')?.classList.contains('hidden') };
    out.sliderVisible = getComputedStyle(document.getElementById('fit-sw')).display !== 'none';
    out.sliderVal = document.getElementById('fit-range').value;
    try {
      const v = window.webGiViewers && window.webGiViewers[0];
      if (v && v.scene && v.scene.activeCamera) {
        const cam = v.scene.activeCamera;
        out.baseDist = cam.target ? +(cam.position.distanceTo(cam.target)).toFixed(3) : null;
      }
    } catch (e) {}
    out.api = { setFit: typeof (window.__ED_api && window.__ED_api.setFit), bg: typeof (window.__ED_api && window.__ED_api.bg), metalLib: typeof (window.__ED_api && window.__ED_api.metalLib) };
    return out;
  });
  console.log(JSON.stringify(r));
  if (r.api.setFit === 'function') {
    const r2 = await p.evaluate(() => {
      const fr = document.getElementById('fit-range');
      fr.value = 160; fr.dispatchEvent(new Event('input'));
      const v = window.webGiViewers[0];
      const cam = v.scene.activeCamera;
      return { val: document.getElementById('fit-val').textContent, dist: cam ? +(cam.position.distanceTo(cam.target)).toFixed(3) : null };
    });
    console.log('after slider 160%:', JSON.stringify(r2));
  }
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();