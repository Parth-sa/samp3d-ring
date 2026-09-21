const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  await p.goto('https://ring-options.pages.dev/webgi-orbit3?model=./assets/LR-12.glb&metal=%23e8a48c', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(16000);
  const r = await p.evaluate(() => {
    const a = window.__meshAudit ? window.__meshAudit() : null;
    const metal = a ? a.find(m => !m.diamond) : null;
    return { metalColor: metal ? metal.color : null, metalEnvInt: metal ? metal.envInt : null };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();