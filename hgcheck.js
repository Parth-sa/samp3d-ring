const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb&v=' + Date.now());
  for (let i = 0; i < 10; i++) { if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break; await p.waitForTimeout(3000); }
  const r = await p.evaluate(() => {
    const e = window.__ringEditor;
    let meshes = 0; const walk = o => { if (!o) return; if (o.isMesh) meshes++; (o.children || []).forEach(walk); };
    walk(e.ringModel);
    const bh = e.buildHierarchy().length;
    return { ringName: e.ringModel && (e.ringModel.name || e.ringModel.type), meshes, bh, rootName: e.root ? (e.root.name||e.root.type) : 'none' };
  });
  console.log('ringModel:', JSON.stringify(r));
  await b.close();
})();
