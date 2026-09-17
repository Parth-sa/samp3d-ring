const { chromium } = require('playwright-core');
async function probe(metal) {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const url = 'https://1f4ddcc0.ring-options.pages.dev/ring-embed.html?model=assets/scene-9.glb&metal=' + metal;
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
    const bg = [200, 200, 200];
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let y = 0; y < tmp.height; y += 6) for (let x = 0; x < tmp.width; x += 6) {
      const i = (y * tmp.width + x) * 4;
      const isBg = Math.abs(d[i] - bg[0]) < 14 && Math.abs(d[i + 1] - bg[1]) < 14 && Math.abs(d[i + 2] - bg[2]) < 14;
      if (!isBg) { rs += d[i]; gs += d[i + 1]; bs += d[i + 2]; n++; }
    }
    return n ? { r: Math.round(rs / n), g: Math.round(gs / n), b: Math.round(bs / n), n } : { n: 0 };
  });
  await b.close();
  return metal + ' -> r:' + r.r + ' g:' + r.g + ' b:' + r.b + ' (px ' + r.n + ')';
}
(async () => {
  console.log(await probe('red'));
  console.log(await probe(encodeURIComponent('#e8eaed')));
})();