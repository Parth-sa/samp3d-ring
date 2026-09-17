const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; const bad = [];
  p.on('pageerror', e => errs.push(String(e).slice(0,160)));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb&v=' + Date.now());
  for (let i = 0; i < 12; i++) { if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break; await p.waitForTimeout(2500); }
  const r = await p.evaluate(async () => {
    document.getElementById('btn-studio').click();
    const rail = Array.from(document.querySelectorAll('#pg-modes .mode-btn')).map(x => x.textContent.replace(/\s+/g,' ').trim());
    const modes = {};
    Array.from(document.querySelectorAll('#pg-modes .mode-btn')).forEach(b => {
      b.click();
      const shown = Array.from(document.querySelectorAll('#st-sections .st-sec')).filter(d => d.style.display !== 'none').map(d => d.querySelector('.st-sec-h span')?.textContent.trim());
      modes[b.dataset.mode] = shown;
    });
    // exercise one section in Scene mode
    document.querySelector('#pg-modes [data-mode="scene"]').click();
    const hier = Array.from(document.querySelectorAll('#st-sections .st-sec')).find(d => d.querySelector('.st-sec-h span')?.textContent.trim() === 'Hierarchy');
    hier.classList.add('open');
    hier.querySelector('[data-op="hier"]').click();
    await new Promise(r => setTimeout(r, 200));
    return { rail, modes, treeRows: document.querySelectorAll('#st-tree [data-hi]').length };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('badHttp:', bad.length ? bad.slice(0,4) : 'none', '| pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();