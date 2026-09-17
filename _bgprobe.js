const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,140)));
  await p.goto('https://8f389822.ring-options.pages.dev/ring-embed3.html?model=assets/LRS-02.glb&metal=%23e8eaed&fit=1.3&bg=%231e1e22', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(2500);
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
    const bright = px.filter(p => p[0] > 170 && p[1] > 170 && p[2] > 170).length;
    const bgHex = window.__envState ? String(window.__envState().bg).slice(0, 20) : 'no-hook';
    return { bgHex, brightThresh170: Math.round(100 * bright / px.length) + '%', total: px.length };
  });
  console.log('scene bg:', r.bgHex, '| bright(>170) px:', r.brightThresh170);
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();