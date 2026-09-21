const { chromium } = require('playwright-core');
const fs = require('fs');
const zlib = require('zlib');

function decodePng(b) {
  let off = 8; const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off); const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(b.slice(off + 8, off + 8 + len));
    if (type === 'IHDR') { var w = b.readUInt32BE(off + 8), h = b.readUInt32BE(off + 12), depth = b[off + 16], ct = b[off + 17]; }
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4 + 1;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(w * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride];
    const line = raw.slice(y * stride + 1, (y + 1) * stride);
    for (let x = 0; x < w * 4; x++) {
      const a = prev[x], bpx = x >= 4 ? out[(y * w) + (x - 4) >> 2 * 4] : 0;
      let v = line[x];
      const left = x >= 4 ? out[y * (w * 4) + (x - 4)] : 0;
      const ul = (x >= 4 && y > 0) ? out[(y - 1) * (w * 4) + (x - 4)] : 0;
      const up = y > 0 ? out[(y - 1) * (w * 4) + x] : 0;
      switch (f) {
        case 1: v = (v + left) & 255; break;
        case 2: v = (v + up) & 255; break;
        case 3: v = (v + ((left + up) >> 1)) & 255; break;
        case 4: {
          const p2 = left + up - ul;
          const pa = Math.abs(p2 - left), pb = Math.abs(p2 - up), pc = Math.abs(p2 - ul);
          const pr = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : ul);
          v = (v + pr) & 255; break;
        }
      }
      out[y * (w * 4) + x] = v; prev[x] = v;
    }
  }
  return { w, h, data: out };
}

async function capture(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) { hidden = await page.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden')); if (hidden) break; await page.waitForTimeout(2500); }
  await page.waitForTimeout(4000);
  const b64 = await page.evaluate(() => new Promise(res => {
    document.getElementById('editor-canvas').toBlob(b => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); }, 'image/png');
  }));
  return Buffer.from(b64.split(',')[1], 'base64');
}

(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  const A = 'https://ring-options.pages.dev/ring-editor?design=%257B%2522configId%2522%253A%2522LRS-03%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-03.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522band%2522%253A%257B%2522metalType%2522%253A%252218K%2522%252C%2522metalColor%2522%253A%252218K%2520Rose%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25222026-09-19T19%253A25%253A33.571Z%2522%257D&model=assets%2FLRS-03.glb&standalone=';
  const B = 'https://ring-options.pages.dev/ring-editor?model=assets%2FLRS-03.glb&standalone=';
  const bA = await capture(p, A);
  const bB = await capture(p, B);
  fs.writeFileSync('G:/webgi viewer/_shotA.png', bA);
  fs.writeFileSync('G:/webgi viewer/_shotB.png', bB);
  const Aimg = decodePng(bA), Bimg = decodePng(bB);
  // find horizontal extents of "bright" pixels (bright = stones/metal lit) near image center band
  function brightExtents(img) {
    const { w, h, data } = img;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, count = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 150) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; count++; }
    }
    return { minX: (minX === 1e9 ? 0 : minX), maxX: maxX < 0 ? 0 : maxX, minY: minY === 1e9 ? 0 : minY, maxY: maxY < 0 ? 0 : maxY, count };
  }
  console.log('A (design rose):', JSON.stringify(brightExtents(Aimg)));
  console.log('B (no design)  :', JSON.stringify(brightExtents(Bimg)));
  let diff = 0, mx = 0;
  for (let i = 0; i < Aimg.data.length; i++) { const d = Math.abs(Aimg.data[i] - Bimg.data[i]); if (d) { diff++; if (d > mx) mx = d; } }
  console.log('diff px count', diff, 'max delta', mx, 'of', Aimg.data.length, 'A-size', Aimg.w + 'x' + Aimg.h, 'B-size', Bimg.w + 'x' + Bimg.h);
  await b.close();
})();