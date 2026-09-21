const { chromium } = require('playwright-core');
const fs = require('fs');

const design = '%257B%2522configId%2522%253A%2522LRS-03%2522%252C%2522model%2522%253A%2522.%252Fassets%252FLRS-03.glb%2522%252C%2522name%2522%253A%2522Loria%2520Solitaire%2522%252C%2522components%2522%253A%257B%2522center%2522%253A%257B%2522stoneType%2522%253A%2522Natural%2520Diamond%2522%252C%2522shape%2522%253A%2522Marquise%2522%252C%2522carat%2522%253A1.5%252C%2522color%2522%253A%2522D%2522%252C%2522clarity%2522%253A%2522VVS1%2522%257D%252C%2522band%2522%253A%257B%2522metalType%2522%253A%252218K%2522%252C%2522metalColor%2522%253A%252218K%2520Rose%2520Gold%2522%257D%257D%252C%2522exportedAt%2522%253A%25222026-09-19T19%253A31%253A47.905Z%2522%257D';
const url = 'https://ring-options.pages.dev/ring-editor?design=' + design + '&model=assets%2FLRS-03.glb&standalone=';
const OUT = 'G:/webgi viewer/_exported-lrs03.glb';

async function loadMeshBoxes(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const g = JSON.parse(b.toString('utf8', 20, 20 + jl));
  const out = [];
  for (let i = 0; i < g.meshes.length; i++) {
    const m = g.meshes[i];
    const acc = g.accessors[m.primitives[0].attributes.POSITION];
    if (!acc.min || !acc.max) continue;
    const d = [acc.max[0] - acc.min[0], acc.max[1] - acc.min[1], acc.max[2] - acc.min[2]];
    out.push((m.name || 'mesh' + i).padEnd(24) + ' ' + d.map(x => x.toFixed(3)).join('x'));
  }
  out.push('nodes:');
  g.nodes.forEach((n, i) => out.push('  ' + i + ' ' + (n.name || '') + (n.scale ? ' scale=' + n.scale.map(x => (+x).toFixed(3)).join(',') : '')));
  return out.join('\n');
}

(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  let downloads = [];
  p.on('download', d => { downloads.push(d); });

  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let hidden = false;
  for (let i = 0; i < 30; i++) { hidden = await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden')); if (hidden) break; await p.waitForTimeout(2500); }
  await p.waitForTimeout(4000);

  const btn = await p.evaluate(() => {
    const all = [...document.querySelectorAll('#st-sections [data-op]')];
    const glb = all.filter(e => e.tagName === 'BUTTON' && (e.textContent || '').includes('Download GLB'));
    if (!glb.length) return null;
    glb[0].click();
    return true;
  });
  if (!btn) { console.log('Download GLB button NOT FOUND'); await b.close(); return; }

  for (let i = 0; i < 40 && !downloads.length; i++) await p.waitForTimeout(1000);
  console.log('downloads:', downloads.length, 'pageErrors:', errs.length ? errs.slice(0, 3) : 'none');
  if (downloads.length) {
    const path = await downloads[0].path();
    fs.copyFileSync(path, OUT);
    console.log('exported to', OUT, fs.statSync(OUT).size, 'bytes, filename', downloads[0].suggestedFilename());
  }
  await b.close();
})();