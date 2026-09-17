const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + new URL(r.url()).pathname.slice(0,50)); });
  const url = 'https://26cf6feb.ring-options.pages.dev/ring-embed.html?model=assets/scene-10.glb&metal=%23e8eaed';
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const sh = getComputedStyle(document.getElementById('loader')).opacity;
    const ui = document.querySelectorAll('.badge,.hint,.panel,button,.swatch').length;
    const c = document.getElementById('webgi-canvas');
    const px = c.getContext('webgl2') || c.getContext('webgl');
    let variance = -1;
    try {
      const d = c.toDataURL('image/png');
      variance = d.length;
    } catch (e) {}
    return { loaderOpacity: sh, uiCount: ui, canvasW: c.width, canvasH: c.height, dataLen: variance };
  });
  console.log('loaded:', r.loaderOpacity === '0', '| ui elems:', r.uiCount, '| canvas:', r.canvasW + 'x' + r.canvasH, '| pixels bytes:', r.dataLen);
  console.log('badHttp:', bad.length ? [...new Set(bad)].slice(0,6) : 'none', '| pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();