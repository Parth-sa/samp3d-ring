const { chromium, devices } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 12'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const consoleAll = [];
  page.on('console', m => consoleAll.push('[' + m.type() + '] ' + m.text().slice(0, 200)));
  page.on('pageerror', e => consoleAll.push('[pageerror] ' + (e.stack || e.message).slice(0, 250)));
  page.on('requestfailed', r => consoleAll.push('[reqfail] ' + r.url().slice(0, 120)));
  page.on('response', r => { const u = r.url(); if (u.includes('ring-editor')) console.log('[resp] ' + r.status() + ' ' + u.match(/[^\/]+$/)); });

  const url = process.argv[2] || 'https://fd805f08.ring-options.pages.dev/ring-editor?lite=1';
  console.log('NAV ' + url + ' UA=' + ctx.browser() && '');
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  // poll state every 5s up to 40s
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => {
      const d = window.__ED_diag;
      const loader = document.getElementById('loader');
      return {
        t: Math.round(performance.now()),
        loaderHidden: !!loader?.classList.contains('hidden'),
        loaderText: loader?.innerText?.trim() || '',
        compCount: document.getElementById('editor-components')?.children.length || 0,
        lastMile: d && d.milestones.length ? d.milestones[d.milestones.length - 1] : 'none',
        err: d ? d.error : '',
        badgeShown: !!(document.getElementById('errtog')?.className || '').match(/has|stuck/),
        badgeText: document.getElementById('errtog')?.innerText || '',
      };
    });
    console.log('T+' + Math.round(st.t / 1000) + 's ' + JSON.stringify(st));
    if (st.loaderHidden && st.compCount > 0) break;
  }
  console.log('===== CONSOLE =====');
  consoleAll.forEach(l => console.log(l));
  await browser.close();
})();
