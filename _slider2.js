const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://5a4c1302.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(2500);
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) { hidden = true; break; }
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const fr = document.getElementById('fit-range');
    const v = window.webGiViewers[0];
    const cam = v.scene.activeCamera;
    const read = () => +(cam.position.distanceTo(cam.target)).toFixed(3);
    const base = read();
    const out = { loader: !!document.getElementById('loader').classList.contains('hidden'), base };
    fr.value = 40; fr.dispatchEvent(new Event('input')); out.p40 = read();
    fr.value = 100; fr.dispatchEvent(new Event('input')); out.p100 = read();
    fr.value = 200; fr.dispatchEvent(new Event('input')); out.p200 = read();
    out.val40 = document.getElementById('fit-val').textContent;
    return out;
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();