const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + new URL(r.url()).pathname.slice(0,60)); });
  const url = 'https://ring-options.pages.dev/ring-editor?lite=1&model=scene-9.glb&metals=Platinum,14K%20White%20Gold,18K%20White%20Gold';
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  const r = await p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1500));
    document.getElementById('btn-studio').click();
    document.querySelector('#pg-modes [data-mode="mods"]')?.click();
    const sel = document.querySelector('[data-op="metalLib"]');
    const options = sel ? Array.from(sel.options).map(o => o.value) : [];
    const compSwatches = Array.from(document.querySelectorAll('#editor-props .sw')).map(s => s.textContent.trim());
    return { loaded: !document.getElementById('loader').classList.contains('hidden'), selOpenedOn: sel ? sel.value : null, options, parts: Array.from(document.querySelectorAll('.comp-row .comp-badge')).length };
  });
  console.log('model-loaded-sel-value:', r.selOpenedOn, '| metal options:', JSON.stringify(r.options));
  console.log('badHttp:', bad.length ? [...new Set(bad)].slice(0,5) : 'none', '| pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();