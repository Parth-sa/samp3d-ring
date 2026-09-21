const { chromium } = require('playwright-core');
const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
async function inspect(url, tag) {
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 720, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text().slice(0, 140)); });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 20; i++) {
    if (await p.evaluate(() => !document.getElementById('loader') || document.getElementById('loader').classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(6000);
  const out = await p.evaluate(() => {
    const api = window.__ED_api;
    const diag = window.__ED_diag;
    let design = null;
    try { design = api ? api.designs() : null; } catch (e) { design = 'ERR ' + e.message; }
    const steps = [...document.querySelectorAll('.lds-i')].map(s => s.textContent.trim());
    return {
      design,
      diag: diag ? { error: diag.error, steps: (diag.steps || []).map(s => ({ n: s.n, ok: s.ok })), extra: diag.extra } : null,
      steps,
      loaderHidden: !!document.getElementById('loader')?.classList.contains('hidden'),
      canvases: [...document.querySelectorAll('canvas')].map(c => [c.width, c.height]),
    };
  });
  await b.close();
  console.log('\n===== ' + tag + ' =====');
  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errs.length ? errs.slice(0, 6).join(' ;; ') : 'none');
}
(async () => {
  const orig = 'https://ring-options.pages.dev/ring-editor?design=%257B%2522configId%2522%253A%2522LRS-02%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-02.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522center%2522%253A%257B%2522stoneType%2522%253A%2522Lab-Grown%2520Diamond%2522%252C%2522shape%2522%253A%2522Marquise%2522%252C%2522carat%2522%253A1.5%252C%2522color%2522%253A%2522D%2522%252C%2522clarity%2522%253A%2522VVS1%2522%257D%252C%2522band%2522%253A%257B%2522metalType%2522%253A%252222K%2522%252C%2522metalColor%2522%253A%252218K%2520Yellow%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25202026-09-11T10%253A49%253A00.549Z%2522%257D&standalone';
  await inspect(orig, 'ORIG-LRS-02');
  const v2link = (require('child_process').execSync('node make-design-link.js LR-12-v2.glb', { encoding: 'utf8' })).trim().split('\n').pop();
  await inspect(v2link, 'MY-LR-12-V2');
})();