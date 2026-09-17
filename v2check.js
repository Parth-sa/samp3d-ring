const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(e));
  p.on('consume', () => {});
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb&v=' + Date.now());
  for (let i = 0; i < 10; i++) { if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break; await p.waitForTimeout(3000); }
  const r = await p.evaluate(() => {
    const st = document.getElementById('studio');
    document.getElementById('btn-studio').click();
    const secs = Array.from(document.querySelectorAll('.st-sec-h span:first-child')).map(s => s.textContent);
    const lib = Array.from(document.querySelectorAll('[data-op]')).length;
    // open plugins & toggle bloom
    const pg = Array.from(document.querySelectorAll('.st-sec')).find(s => s.querySelector('.st-sec-h') && s.querySelector('.st-sec-h span:first-child').textContent === 'Plugins / PostFX');
    if (pg) { pg.classList.add('open'); const cb = pg.querySelector('.plg-bloom'); if (cb) { cb.checked = true; cb.dispatchEvent(new Event('click')); } }
    // hierarchy refresh
    Array.from(document.querySelectorAll('.st-sec')).find(s => s.querySelector('.st-sec-h span:first-child').textContent === 'Hierarchy')?.classList.add('open');
    const ref = Array.from(document.querySelectorAll('[data-op="hier"]'))[0]; if (ref) ref.click();
    return new Promise(res => setTimeout(() => res({
      open: st.classList.contains('open'), secs, controls: lib,
      tree: (document.getElementById('st-tree').children.length),
      disp: document.getElementById('st-tree').textContent.slice(0, 80)
    }), 600));
  });
  console.log('studio open:', r.open);
  console.log('sections(' + r.secs.length + '):', JSON.stringify(r.secs));
  console.log('op controls:', r.controls, 'tree rows:', r.tree, '->', JSON.stringify(r.disp));
  console.log('badHttp:', bad.length ? bad.slice(0, 4) : 'none');
  console.log('pageErrors:', errs.length ? errs.slice(0, 3).map(e => String(e).slice(0, 120)) : 'none');
  await b.close();
})();
