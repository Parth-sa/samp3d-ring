const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  await p.goto('https://b175d357.ring-options.pages.dev/lr12', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(2500);
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) { hidden = true; break; }
  }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => new Promise(res => {
    let stoneInfo = null, apiOk = false;
    const hidden = !!document.getElementById('loader')?.classList.contains('hidden');
    try {
      const api = window.__ED_api;
      const c = api && api.designs && JSON.parse(api.designs() || '{}');
      apiOk = !!(api && api.diaScale);
      const e = window.webGiViewers && window.webGiViewers[0];
      if (e && e.scene && e.scene.modelRoot && e.scene.modelRoot.modelObject) {
        const root = e.scene.modelRoot.modelObject;
        const stones = [];
        root.traverse(o => { if (o.isMesh && /diamond|stone|marquise|gem/i.test((o.name||'') + ' ' + ((o.material&&o.material[0]?o.material[0].name:'')||(o.material&&o.material.name)) )) stones.push({ n: o.name, s: o.scale ? +o.scale.x.toFixed(3) : 1 }); });
        stoneInfo = stones.slice(0, 8);
      }
    } catch (err) {}
    res({ hidden, apiOk, stoneInfo });
  }));
  console.log('before:', JSON.stringify(r));
  const a = await p.evaluate(() => {
    const api = window.__ED_api;
    api.diaScale(2);
    const root = window.webGiViewers[0].scene.modelRoot.modelObject;
    const stones = [];
    root.traverse(o => { if (o.isMesh && /diamond|stone|marquise|gem/i.test((o.name||'') + ' ' + ((o.material&&o.material[0]?o.material[0].name:'')||(o.material&&o.material.name)) )) stones.push({ n: o.name, s: o.scale ? +o.scale.x.toFixed(3) : 1 }); });
    return { stones: stones.slice(0, 8), diaVal: document.getElementById('dia-val') ? '' : '' };
  });
  console.log('after diaScale(2):', JSON.stringify(a));
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();