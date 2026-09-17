const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const urls = [];
  p.on('response', r => { const u = r.url(); if (/\.(hdr|exr|glb|gltf|jpeg|jpg|png|json|webp|bin|drc)(\?|$)/i.test(u)) urls.push(u + ' ' + r.status()); });
  p.on('response', r => { const u = r.url(); if (/\.(hdr|exr|glb|bin|drc)/i.test(u)) urls.push('BIN:' + u); });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://playground.ijewel3d.com/?noUpdate', { timeout: 60000 });
  await p.waitForTimeout(15000);
  const dom = await p.evaluate(() => {
    const opts = [];
    const sections = [];
    document.querySelectorAll('select option').forEach(o => { if (o.textContent.trim()) opts.push(o.textContent.trim() + '=' + o.value); });
    document.querySelectorAll('.v-bind, .configuration, .js-camera_bind, [class*=env], [class*=background], [class*=material]').forEach(el => { if (el.textContent && el.textContent.trim().length < 200) sections.push((el.className||'') + ' :: ' + el.textContent.trim().slice(0,150)); });
    const imgs = Array.from(document.images).map(i => i.currentSrc || i.src).filter(Boolean);
    return { opts: opts.slice(0,150), sections: sections.slice(0,60), imgs: imgs.slice(0,60), title: document.title, url: location.href };
  });
  fs.writeFileSync('playground_scrape.json', JSON.stringify({ urls: Array.from(new Set(urls)).slice(0,200), dom, errs }, null, 1));
  console.log('requests captured:', urls.length);
  const envKeys = urls.filter(u => /hdr|exr|glb/.test(u));
  console.log('env/model calls:', envKeys.length);
  console.log('TITLE:', dom.title);
  console.log('OPTS sample:', JSON.stringify(dom.opts.slice(0,40), null, 0));
  await b.close();
})();
