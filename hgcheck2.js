const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb&v=' + Date.now());
  for (let i = 0; i < 10; i++) { if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break; await p.waitForTimeout(3000); }
  const r = await p.evaluate(() => {
    const e = window.__ringEditor;
    const rm = e.ringModel;
    const kids = (rm?.children || []).map(c => c.type + ':' + (c.name || '') + '(' + (c.children||[]).length + ')').slice(0, 20);
    return { nkids: (rm?.children||[]).length, kids, hasModelObject: !!rm?.modelObject, modelObjectType: rm?.modelObject?.type, rootType: e.root?.type };
  });
  console.log('graph:', JSON.stringify(r, null, 1));
  await b.close();
})();
