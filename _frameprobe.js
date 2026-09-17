const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const logs = [];
  p.on('console', m => logs.push('[' + m.type() + '] ' + m.text().slice(0, 260)));
  p.on('pageerror', e => logs.push('[pageerror] ' + String(e).slice(0, 260)));
  await p.goto('https://43191e60.ring-options.pages.dev/ring-embed3.html?model=assets/scene-10.glb&metal=%23ffffff&fit=1.3', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => new Promise(async res => {
    const c = document.getElementById('webgi-canvas');
    const snap = () => {
      const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
      tmp.getContext('2d').drawImage(c, 0, 0);
      return tmp.getContext('2d').getImageData(0, 0, tmp.width, tmp.height).data;
    };
    const a = snap();
    await new Promise(r2 => setTimeout(r2, 800));
    const b = snap();
    let diffs = 0;
    for (let i = 0; i < a.length; i += 997) if (a[i] !== b[i]) diffs++;
    const vw = window.__viewer3;
    let stats = {};
    if (vw) {
      stats.enabled = vw.enabled;
      stats.rendererReady = !!vw.renderer?.webglRenderer || !!vw.renderer?.rendererObject;
      stats.frameTick = vw.renderer?.frameTick;
    }
    res({ diffs, stats });
  }));
  console.log('frameDiffOctets:', r.diffs, '| viewer:', JSON.stringify(r.stats));
  console.log('console/page logs:', logs.slice(0, 14).join('\n'));
  await b.close();
})();