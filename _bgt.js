const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  const base = 'https://3fd41604.ring-options.pages.dev/ring-editor?standalone';
  for (const q of ['', '&swbg=white']) {
    const pg = await b.newPage({ viewport: { width: 640, height: 480 } });
    await pg.goto(base + q, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 15; i++) {
      if (await pg.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
      await pg.waitForTimeout(2500);
    }
    await pg.waitForTimeout(1500);
    const r = await pg.evaluate(() => {
      const sw = getComputedStyle(document.getElementById('metal-sw'));
      const swBtn = getComputedStyle(document.querySelector('#metal-sw button'));
      return {
        cls: document.documentElement.className,
        swBg: sw.backgroundColor, swBtnColor: swBtn.color,
        swatchVisible: sw.display !== 'none',
        apiBg: typeof (window.__ED_api && window.__ED_api.bg)
      };
    });
    console.log('q=' + (q || '(none)') + ':', JSON.stringify(r));
    await pg.close();
  }
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();