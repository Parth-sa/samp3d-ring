const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.goto('https://playground.ijewel3d.com/v2/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(6000);
  const dump = await p.evaluate(() => {
    const seen = new Set(); const lines = [];
    const render = (el, depth) => {
      if (depth > 7 || !el) return;
      let out = '  '.repeat(depth) + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0,3).join('.') : '');
      const txt = (el.childNodes && el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? ' "' + el.childNodes[0].textContent.trim().slice(0,40) + '"' : '');
      if (out.length > 300) out = out.slice(0,300);
      const key = out;
      if (seen.has(key) && depth >= 4) return;
      if (depth >= 4) seen.add(key);
      lines.push(out + txt);
      Array.from(el.children || []).slice(0, 8).forEach(c => render(c, depth + 1));
    };
    Array.from(document.body.children).forEach(c => render(c, 0));
    return lines.join('\n');
  });
  require('fs').writeFileSync('v2_dom.txt', dump);
  console.log('bytes:', dump.length);
  await b.close();
})();