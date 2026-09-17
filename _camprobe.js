const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  for (const fit of [null, 2]) {
    const p = await b.newPage({ viewport: { width: 640, height: 480 } });
    const url = 'https://067b48cc.ring-options.pages.dev/ring-embed3.html?model=assets/scene-10.glb&metal=%23e8eaed' + (fit ? '&fit=' + fit : '');
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 15; i++) {
      if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
      await p.waitForTimeout(2500);
    }
    await p.waitForTimeout(3000);
    const info = await p.evaluate(() => {
      const c = document.getElementById('webgi-canvas');
      const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
      const ctx = tmp.getContext('2d'); ctx.drawImage(c, 0, 0);
      const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
      const bg = [200, 200, 200];
      let n = 0;
      for (let y = 0; y < tmp.height; y += 4) for (let x = 0; x < tmp.width; x += 4) {
        const i = (y * tmp.width + x) * 4;
        const isBg = Math.abs(d[i] - bg[0]) < 14 && Math.abs(d[i + 1] - bg[1]) < 14 && Math.abs(d[i + 2] - bg[2]) < 14;
        if (!isBg) n++;
      }
      return { px: n, cam: window.__camProbe ? window.__camProbe() : 'no hook' };
    });
    console.log('fit=' + fit, JSON.stringify(info));
    await p.close();
  }
  await b.close();
})();