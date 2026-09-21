const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://44a4f366.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 20; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const mSel = Array.from(document.querySelectorAll('select')).map(s => ({ v: s.value, ops: (s.dataset.op || s.className || '').slice(0, 40) }));
    let cams = null;
    try {
      const v = window.webGiViewers && window.webGiViewers[0];
      if (v) {
        const cam = v.scene.activeCamera;
        cams = cam ? { pos: cam.position.toArray().map(n => +n.toFixed(3)), target: cam.target ? cam.target.toArray().map(n => +n.toFixed(3)) : null } : null;
      }
    } catch (e) {}
    return { selects: mSel, cam: cams };
  });
  console.log(JSON.stringify(r));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();