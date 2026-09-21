const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,200)));
  p.on('console', m => { if (m.type() === 'error') console.log('CERR:', m.text().slice(0,200)); });
  await p.goto('https://ring-options.pages.dev/webgi-orbit3?model=./assets/LR-12.glb&metal=%23f0ce6e', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(12000);
  const r = await p.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('canvas'));
    return {
      windKeys: Object.keys(window).filter(k => /viewer|ring|env|mesh/i.test(k)).slice(0, 20),
      canvases: cs.map(c => [c.width, c.height, !!c.offsetWidth]),
      bodyText: document.body.innerText.slice(0, 200).replace(/\s+/g, ' ')
    };
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();