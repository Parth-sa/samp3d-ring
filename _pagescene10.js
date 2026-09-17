const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + new URL(r.url()).pathname.slice(0,50)); });
  await p.goto('https://8f389822.ring-options.pages.dev/ring-scene10.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => ({
    loaded: document.getElementById('loader').classList.contains('hidden'),
    panel: !!document.getElementById('metal-panel'),
    swatches: document.querySelectorAll('.swatch').length,
    colorInput: document.getElementById('metal-color')?.value,
    hint: document.querySelector('.hint')?.textContent.slice(0, 30),
    badge: document.querySelector('.badge b')?.textContent
  }));
  console.log(JSON.stringify(r));
  console.log('badHttp:', bad.length ? [...new Set(bad)].slice(0,6) : 'none', '| pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();