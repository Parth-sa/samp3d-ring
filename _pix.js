const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  p.on('pageerror', e => console.log('PAGEERR', String(e).slice(0,160)));
  const cache = {};
  for (const q of ['', '&swbg=white']) {
    const pg = await b.newPage({ viewport: { width: 640, height: 480 } });
    await pg.goto('https://ea69b070.ring-options.pages.dev/ring-editor?standalone' + q, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 15; i++) {
      if (await pg.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
      await pg.waitForTimeout(2500);
    }
    await pg.waitForTimeout(4000);
    const r = await pg.evaluate(async () => {
      function px(x, y) {
        const c = document.querySelector('canvas');
        if (!c) return null;
        const g = c.getContext('webgl2') || c.getContext('webgl');
        if (!g) return null;
        const d = new Uint8Array(4);
        g.readPixels(x, y, 1, 1, g.RGBA, g.UNSIGNED_BYTE, d);
        return Array.from(d);
      }
      const c = document.querySelector('canvas');
      return {
        cls: document.documentElement.className,
        canvasVisible: c && !!c.offsetWidth,
        pxTL: px(5, 5), pxC: px(Math.floor(c.width / 2), Math.floor(c.height / 2)), pxBR: px(c.width - 5, c.height - 5)
      };
    });
    cache[q || '(cream)'] = r;
    console.log(q || '(cream):', JSON.stringify(r));
    await pg.close();
  }
  await b.close();
})();