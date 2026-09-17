const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const net = [];
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  p.on('response', async r => {
    const u = r.url();
    if (/packs\.ijewel3d|storage\.googleapis|dropzone|models\.ijewel|\.glb/.test(u)) net.push(r.status() + ' ' + u.slice(0,110));
  });
  await p.goto('https://ring-options-v2.pages.dev/?probe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(22000);
  const r = await p.evaluate(() => {
    const canvas = document.querySelector('#webgi-canvas-container canvas') || document.querySelector('#webgi-mini-editor-canvas-container canvas');
    let gl = null;
    try { gl = canvas && canvas.getContext('webgl2'); } catch (e) {}
    const dropTxt = Array.from(document.querySelectorAll('div')).map(d => (d.textContent || '').trim()).find(t => /drag|drop|model|load/i.test(t) && t.length < 60);
    return { canvasOK: !!canvas, canvasSize: canvas ? canvas.width + 'x' + canvas.height : null, dropTxt, bodyChildren: document.body.childElementCount };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('MODEL-NET:', net.length ? net : '(none)');
  console.log('pageErrors:', errs.length ? errs.slice(0,4) : 'none');
  await b.close();
})();