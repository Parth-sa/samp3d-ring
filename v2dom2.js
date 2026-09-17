const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.goto('https://playground.ijewel3d.com/v2/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(14000);
  const d = await p.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) return 'NO ROOT';
    const all = (root.textContent || '').length;
    const seen = new Set(); const lines = [];
    const render = (el, depth) => {
      if (depth > 10 || !el) return;
      let cls = (typeof el.className === 'string' ? el.className.split(' ').slice(0,4).join('.') : '');
      let out = '  '.repeat(depth) + String(el.tagName).toLowerCase() + (el.id ? '#'+el.id : '') + (cls ? '.'+cls : '');
      const txt = (el.childNodes && el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? ' "'+el.childNodes[0].textContent.trim().slice(0,30)+'"' : '');
      const key = out;
      if (seen.has(key) && depth >= 3) return;
      if (depth >= 3) seen.add(key);
      lines.push(out + txt);
      const kids = Array.from(el.children || []);
      if (kids.length > 10 && depth >= 4) { lines.push('  '.repeat(depth+1) + '[' + kids.length + ' children]'); return; }
      kids.slice(0, 12).forEach(c => render(c, depth + 1));
    };
    Array.from(root.children).slice(0, 14).forEach(c => render(c, 0));
    return 'rootChars ' + all + '\n' + lines.join('\n');
  });
  require('fs').writeFileSync('v2_dom2.txt', d);
  console.log(d.slice(0, 400));
  await b.close();
})();