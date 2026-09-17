const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb');
  for (let i = 0; i < 8; i++) {
    const r = await p.evaluate(() => ({ hidden: !!document.getElementById('loader')?.classList.contains('hidden'), tools: !!document.querySelector('#model-tools'), sliders: document.querySelectorAll('[data-scale]').length, uploads: document.querySelectorAll('[data-upload]').length }));
    if (r.hidden) {
      console.log('LOADED tools:', r.tools, 'sliders:', r.sliders, 'uploads:', r.uploads);
      const before = await p.evaluate(() => window.__ringEditor.ringModel.scale.x);
      await p.evaluate(() => { const s = document.querySelector('[data-scale]'); s.value = '150'; s.dispatchEvent(new Event('input')); });
      await p.waitForTimeout(300);
      const after = await p.evaluate(() => window.__ringEditor.ringModel.scale.x);
      console.log('scale before:', before, 'after 150%:', after, '\nUI label:', await p.evaluate(() => document.querySelector('.mt-val').textContent));
      break;
    }
    await p.waitForTimeout(3000);
  }
  await b.close();
})();
