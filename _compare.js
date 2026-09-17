const { chromium } = require('playwright-core');
async function sample(url, viewport) {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,140)));
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const c = document.getElementById('webgi-canvas') || document.querySelector('canvas');
    if (!c) return null;
    const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
    const ctx = tmp.getContext('2d'); ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const px = (x, y) => { const i = (y * tmp.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const center = px(tmp.width >> 1, tmp.height >> 1);
    const up = px(tmp.width >> 1, Math.floor(tmp.height * 0.30));
    const down = px(tmp.width >> 1, Math.floor(tmp.height * 0.85));
    const W = tmp.width, H = tmp.height;
    const scan = { warm: [0, 0, 0], n: 0 };
    for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) {
      const i = (y * W + x) * 4;
      const rr = d[i], gg = d[i + 1], bb = d[i + 2];
      const isBg = rr > 245 && gg > 245 && bb > 245;
      if (!isBg) { scan.warm[0] += rr; scan.warm[1] += gg; scan.warm[2] += bb; scan.n++; }
    }
    const a = scan.warm.map(v => Math.round(v / Math.max(1, scan.n)));
    return { center, up, down, ringAvg: a, n: scan.n, canvas: [W, H] };
  });
  await b.close();
  return { r, errs };
}
(async () => {
  const editorUrl = 'https://0d620763.ring-options.pages.dev/ring-editor?design=%257B%2522configId%2522%253A%2522LRS-02%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-02.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522center%2522%253A%257B%2522stoneType%2522%253A%2522Lab-Grown%2520Diamond%2522%252C%2522shape%2522%253A%2522Marquise%2522%252C%2522carat%2522%253A1.5%252C%2522color%2522%253A%2522D%2522%252C%2522clarity%2522%253A%2522VVS1%2522%257D%252C%2522band%2522%253A%257B%2522metalType%2522%253A%252222K%2522%252C%2522metalColor%2522%253A%252218K%2520Yellow%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25222026-09-11T10%253A49%253A00.549Z%2522%257D';
  const embedUrl = 'https://0d620763.ring-options.pages.dev/ring-embed3.html?model=assets/LRS-02.glb&metal=%23d4af37';
  const a = await sample(editorUrl, { width: 390, height: 844 });
  const b = await sample(embedUrl, { width: 390, height: 844 });
  console.log('EDITOR:', JSON.stringify(a.r), a.errs.length ? 'ERR ' + a.errs[0] : '');
  console.log('EMBED :', JSON.stringify(b.r), b.errs.length ? 'ERR ' + b.errs[0] : '');
})();