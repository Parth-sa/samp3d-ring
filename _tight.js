const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://fbb24fc5.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(2500);
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) { hidden = true; break; }
  }
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => {
    const out = { hidden: !!document.getElementById('loader')?.classList.contains('hidden'), sizeSlider: !!document.getElementById('fit-range'), diamondSlider: !!document.getElementById('dia-range') };
    try {
      const e = window.webGiViewers[0];
      const cam = e.scene.activeCamera;
      out.camDist = cam.target ? +(cam.position.distanceTo(cam.target)).toFixed(3) : null;
    } catch (e2) {}
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();