const { chromium } = require('playwright-core');
const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
async function sample(url, tag) {
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 720, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 120)); });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let ok = false;
  for (let i = 0; i < 20; i++) {
    ok = await p.evaluate(() => !document.getElementById('loader') || document.getElementById('loader').classList.contains('hidden'));
    if (ok) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(5000);
  const rows = await p.evaluate(() => {
    const ids = ['webgi-canvas', 'webgi-canvas'] ;
    const els = document.querySelectorAll('canvas');
    const out = [];
    for (const c of els) {
      const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
      const ctx = tmp.getContext('2d'); ctx.drawImage(c, 0, 0);
      const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
      out.push({ w: c.width, h: c.height, samp: [0.5, 0.3], pxAt: px(d, tmp.width, Math.floor(tmp.height * 0.3)).join(',') });
    }
    const c = els[0]; const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
    const ctx = tmp.getContext('2d'); ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    function px(arr, W, y) { const i = (y * W + Math.floor(W * 0.5)) * 4; return [arr[i], arr[i + 1], arr[i + 2]]; }
    const center = px(d, tmp.width, tmp.height >> 1);
    const top = px(d, tmp.width, Math.floor(tmp.height * 0.20));
    const bottom = px(d, tmp.width, Math.floor(tmp.height * 0.85));
    let warm = [0, 0, 0], n = 0;
    for (let y = 0; y < tmp.height; y += 5) for (let x = 0; x < tmp.width; x += 5) {
      const i = (y * tmp.width + x) * 4;
      const isBg = d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245;
      if (!isBg) { warm[0] += d[i]; warm[1] += d[i + 1]; warm[2] += d[i + 2]; n++; }
    }
    const rgba = (a) => `rgb(${a.map(v => Math.round(v)).join(',')})`;
    return { center: rgba(center), top: rgba(top), bottom: rgba(bottom), ringAvg: rgba(warm.map(v => v / Math.max(1, n))), coverPx: n, canvas: [tmp.width, tmp.height], loaderHidden: !!document.getElementById('loader')?.classList.contains('hidden') };
  });
  await b.close();
  console.log(tag, '::', JSON.stringify(rows), '| errors:', errs.length ? errs.slice(0, 4).join(' ;; ') : 'none');
}
(async () => {
  const orig = 'https://ring-options.pages.dev/ring-editor?design=%257B%2522configId%2522%253A%2522LRS-02%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-02.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522center%2522%253A%257B%2522stoneType%2522%253A%2522Lab-Grown%2520Diamond%2522%252C%2522shape%2522%253A%2522Marquise%2522%252C%2522carat%2522%253A1.5%252C%2522color%2522%253A%2522D%2522%252C%2522clarity%2522%253A%2522VVS1%2522%257D%252C%2522band%2522%253A%257B%2522metalType%2522%253A%252222K%2522%252C%2522metalColor%2522%253A%252218K%2520Yellow%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25202026-09-11T10%253A49%253A00.549Z%2522%257D&standalone';
  await sample(orig, 'ORIG-LRS-02');
  const v2 = (require('child_process').execSync('node make-design-link.js LR-12-v2.glb', { encoding: 'utf8' })).trim().split('\n').pop();
  await sample(v2, 'MY-LR-12-V2');
})();