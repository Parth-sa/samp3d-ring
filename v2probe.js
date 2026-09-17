const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,200)));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + new URL(r.url()).host + r.url().slice(r.url().indexOf(new URL(r.url()).host) + new URL(r.url()).host.length).slice(0,80)); });
  await p.goto('https://ring-options-v2.pages.dev/?probe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(16000);
  const r = await p.evaluate(() => {
    const root = document.getElementById('root');
    const chars = root ? (root.textContent || '').length : 0;
    const overlay = document.getElementById('overlay');
    const modes = Array.from(document.querySelectorAll('.mode-buttons-container .mode-button')).map(x => x.textContent.trim());
    const canvas = !!document.querySelector('#webgi-canvas-container canvas') || !!document.querySelector('#webgi-mini-editor-canvas-container canvas');
    const err = window.__modules ? 'has-modules' : 'no-modules';
    return { chars, overlayStyle: overlay ? overlay.style.opacity : null, modes, canvas, err, title: document.title, rootChildren: root ? root.childElementCount : 0 };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('badHttp:', bad.length ? bad.slice(0,8) : 'none');
  console.log('pageErrors:', errs.length ? errs.slice(0,5) : 'none');
  await b.close();
})();