const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  p.on('console', m => console.log('[' + m.type() + ']', m.text().slice(0, 300)));
  p.on('pageerror', e => console.log('[PAGEERR]', String(e).slice(0, 400)));
  await p.goto('https://481da22c.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(20000);
  await b.close();
})();