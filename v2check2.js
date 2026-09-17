const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb&v=' + Date.now());
  for (let i = 0; i < 10; i++) { if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break; await p.waitForTimeout(3000); }
  const r = await p.evaluate(() => {
    document.getElementById('btn-studio').click();
    const hier = Array.from(document.querySelectorAll('.st-sec')).find(s => s.querySelector('.st-sec-h span:first-child')?.textContent === 'Hierarchy');
    hier.classList.add('open');
    const ref = Array.from(document.querySelectorAll('[data-op="hier"]'))[0];
    ref.click();
    const rows = Array.from(document.querySelectorAll('#st-tree [data-hi]'));
    return { n: rows.length, sample: rows.slice(0,6).map(x => x.textContent.replace(/\s+/g,' ').trim()) };
  });
  // click first row → selection highlight emissive
  const sel = await p.evaluate(async () => {
    const row = document.querySelector('#st-tree [data-hi]');
    if (row) row.click();
    await new Promise(r => setTimeout(r, 300));
    const m = window.__ringEditor.selectedObj;
    return { selectedName: m ? m.name : null, emissiveHex: m && m.material && m.material.emissive ? m.material.emissive.getHex().toString(16) : null };
  });
  console.log('tree rows:', r.n, '| sample:', JSON.stringify(r.sample));
  console.log('selected:', JSON.stringify(sel));
  console.log('badHttp:', bad.length ? bad.slice(0,4) : 'none', '| pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();
