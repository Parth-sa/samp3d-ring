const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  await p.goto('https://0c8016ca.ring-options.pages.dev/ring-embed3.html?model=assets/scene-10.glb&metal=%23ffffff&fit=1.3', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() => window.__meshAudit ? window.__meshAudit() : 'no audit hook');
  const rows = Array.isArray(out) ? out.map(m => JSON.stringify(m)) : String(out);
  console.log('mesh count:', Array.isArray(out) ? out.length : '-');
  console.log(rows.slice(0, 36).join('\n'));
  await b.close();
})();