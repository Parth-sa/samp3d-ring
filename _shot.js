const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const url = 'https://1f4ddcc0.ring-options.pages.dev/ring-embed.html?model=assets/scene-9.glb&metal=%23e8eaed';
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(3000);
  await p.screenshot({ path: 'C:\\Users\\Nimisha\\AppData\\Local\\Temp\\opencode\\embed-shot.png' });
  await b.close();
  console.log('saved');
})();