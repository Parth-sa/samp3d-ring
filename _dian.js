const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://b175d357.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(2500);
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) { hidden = true; break; }
  }
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => {
    const out = { hidden: !!document.getElementById('loader')?.classList.contains('hidden') };
    try {
      const api = window.__ED_api;
      let carat = null, scale = null, name = null;
      const e = window.webGiViewers && window.webGiViewers[0];
      if (e && e.scene && e.scene.modelRoot && e.scene.modelRoot.modelObject) {
        e.scene.modelRoot.modelObject.traverse(o => {
          if (o.isMesh && /diamond|marquise|stone/i.test(o.name || '') && scale === null) {
            name = o.name; scale = o.scale ? +o.scale.x.toFixed(4) : 1;
          }
        });
      }
      const d = api && api.designs ? api.designs() : null;
      if (d && d.components && d.components.center) carat = d.components.center.carat;
      out.name = name; out.scale = scale; out.carat = carat; out.diaSlider = !!document.getElementById('dia-range');
    } catch (e2) { out.err = String(e2); }
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();