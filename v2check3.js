const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,200)));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb&v=' + Date.now());
  for (let i = 0; i < 12; i++) { if (await p.evaluate(() => !document.getElementById('loader')?.classList.contains('hidden')) === false && await p.evaluate(() => !!document.getElementById('canvas-scene'))) break; await p.waitForTimeout(2500); }
  await p.evaluate(() => { document.getElementById('btn-studio').click(); window.__st = document.getElementById('st-sections'); });
  const report = await p.evaluate(async () => {
    const S = document.getElementById('st-sections');
    const secs = Array.from(S.querySelectorAll('.st-sec')).map(d => d.querySelector('.st-sec-h span:first-child').textContent.trim());
    const out = {}; const toasts = [];
    const orig = window.showToast;
    const grab = (sel, init) => { const el = S.querySelector(sel); if (!el) return 'MISSING ' + sel; el.value = init === undefined ? el.value : init; el.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; };
    // open all sections + click buttons + flip checkboxes + fire selects
    S.querySelectorAll('.st-sec').forEach(d => d.classList.add('open'));
    const clickOp = (op) => { const el = S.querySelector('[data-op="' + op + '"]'); if (!el) return 'MISS ' + op; el.click(); return 'click'; };
    S.querySelectorAll('[data-op]').forEach(el => { if (!el.classList.contains('st-check')) el.dispatchEvent(new Event(('INPUT' === el.tagName && el.type !== 'checkbox' ? 'input' : 'change'), { bubbles: true })); });
    // exercises
    out.tm = grab('[data-op="tm"]', 'no');
    out.env = grab('[data-op="env"]', './assets/hdrmaps/metal/env-metal-002.exr');
    out.gem = grab('[data-op="gem"]', './assets/hdrmaps/gem/env-gem-003.hdr');
    out.pg = grab('[data-op="pg"]', 'pg4');
    out.bg = grab('[data-op="bg"]', 'transparent');
    out.shSize = grab('[data-op="shSize"]', '4096');
    out.view = grab('[data-op="view"]', 'front');
    out.metalLib = grab('[data-op="metalLib"]', 'silver');
    out.glb = grab('[data-op="glb"]', '8');
    out.blend = grab('[data-op="blend"]', 'additive');
    out.sideCheck = grab('[data-op="side"]', 'back');
    out.mkD = clickOp('mkD'); out.mkS = clickOp('mkS'); out.cntD = clickOp('cntD');
    out.plugChk = (function(){ let n=0, badI=[]; S.querySelectorAll('[data-op="plugin"]').forEach(c => { try { c.click(); c.click(); n++; } catch(e){ badI.push(c.dataset.arg); } }); return n + ' toggles' + (badI.length ? ' BAD:'+badI : ''); })();
    out.addview = clickOp('addview');
    out.rlightOn = (function(){ const c = S.querySelector('[data-op="rlight"]'); if(!c) return 'MISS rlight'; c.click(); return 'on'; })();
    out.matcol = grab('[data-op="matcol"]', '#ff0000');
    out.flat = (function(){ const c = S.querySelector('[data-op="flat"]'); if(!c) return 'MISS flat'; c.click(); return 'flat'; })();
    out.pick = clickOp('pick'); out.hier = clickOp('hier');
    const tree = S.querySelectorAll('#st-tree [data-hi]').length;
    out.treeRows = tree;
    await new Promise(r => setTimeout(r, 400));
    return { secCount: secs.length, secs, out, treeRows: S.querySelectorAll('#st-tree [data-hi]').length };
  });
  console.log(JSON.stringify(report, null, 1).slice(0, 3000));
  console.log('badHttp:', bad.slice(0,5).length ? bad : 'none');
  console.log('pageErrors:', errs.length ? errs.slice(0,5) : 'none');
  await b.close();
})();