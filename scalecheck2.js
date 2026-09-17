const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb');
  for (let i = 0; i < 8; i++) {
    const hidden = await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'));
    if (hidden) break;
    await p.waitForTimeout(3000);
  }
  const before = await p.evaluate(() => {
    const ed = window.__ringEditor;
    const rm = ed.ringModel;
    return { keys: Object.keys(rm), hasScale: 'scale' in rm, scaleJson: JSON.stringify(rm.scale), root: ed.rootObject ? ed.rootObject.uuid : null };
  });
  console.log(JSON.stringify(before).slice(0, 500));
  await p.evaluate(() => { const s = document.querySelector('[data-scale]'); s.value = '150'; s.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => {
    const ed = window.__ringEditor; const rs = ed.ringModel.scale;
    return { x: rs && rs.x, y: rs && rs.y, z: rs && rs.z, label: document.querySelector('.mt-val').textContent };
  });
  console.log('after:', JSON.stringify(after));
  await b.close();
})();
