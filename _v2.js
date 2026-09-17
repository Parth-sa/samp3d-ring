const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,140)));
  await p.goto('https://eee59db1.ring-options.pages.dev/ring-embed3.html?model=assets/scene-10.glb&metal=%23ffffff&fit=1.3', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const c = document.getElementById('webgi-canvas');
    const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
    const ctx = tmp.getContext('2d'); ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const px = [];
    for (let y = 0; y < tmp.height; y += 4) for (let x = 0; x < tmp.width; x += 4) {
      const i = (y * tmp.width + x) * 4;
      px.push([d[i], d[i + 1], d[i + 2]]);
    }
    const nonBk = px.filter(p => !(p[0] > 250 && p[1] > 250 && p[2] > 250));
    const avg = nonBk.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
    const n = Math.max(1, nonBk.length);
    const bright = nonBk.filter(p => p[0] > 210 && p[1] > 210 && p[2] > 210).length;
    return { avg: [Math.round(avg[0] / n), Math.round(avg[1] / n), Math.round(avg[2] / n)], n: nonBk.length, whiteish: Math.round(100 * bright / n) + '%', env: window.__envState ? window.__envState() : 'n/a' };
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();