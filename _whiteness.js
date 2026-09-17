const { chromium } = require('playwright-core');
async function probe(url) {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,140)));
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    for (let y = 0; y < tmp.height; y += 6) for (let x = 0; x < tmp.width; x += 6) {
      const i = (y * tmp.width + x) * 4;
      px.push([d[i], d[i + 1], d[i + 2]]);
    }
    const nonWhiteBk = px.filter(p => !(p[0] > 235 && p[1] > 235 && p[2] > 235));
    const avg = nonWhiteBk.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
    const n = Math.max(1, nonWhiteBk.length);
    const bright = nonWhiteBk.filter(p => p[0] > 200 && p[1] > 200 && p[2] > 200).length;
    return { avg: [Math.round(avg[0] / n), Math.round(avg[1] / n), Math.round(avg[2] / n)], nonWhiteBk: nonWhiteBk.length, brightPct: Math.round(100 * bright / n) };
  });
  await b.close();
  return { r, errs };
}
(async () => {
  const base = 'https://e6cc293b.ring-options.pages.dev/ring-embed3.html?model=assets/scene-10.glb&fit=1.3';
  for (const [label, extra] of [['gold(default no param)', ''], ['white(#ffffff)', '&metal=%23ffffff'], ['yellow(#c5ad6d)', '&metal=%23c5ad6d'], ['whitegold(#e8eaed)', '&metal=%23e8eaed']]) {
    const { r, errs } = await probe(base + extra);
    console.log(label.padEnd(26), 'avg:', JSON.stringify(r.avg), '| nonwhite px:', r.nonWhiteBk, '| bright>200:', r.brightPct + '%', errs.length ? 'ERR ' + errs[0] : '');
  }
})();