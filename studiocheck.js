const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb');
  let ok = false;
  for (let i = 0; i < 8; i++) {
    ok = await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'));
    if (ok) break;
    await p.waitForTimeout(3000);
  }
  const r = await p.evaluate(() => {
    const studio = document.getElementById('studio');
    document.getElementById('btn-studio').click();
    const secs = Array.from(document.querySelectorAll('.st-sec-h span:first-child')).map(s => s.textContent);
    const sel = document.getElementById('st-sel-bg');
    sel.value = 'white'; sel.dispatchEvent(new Event('change'));
    return new Promise(res => setTimeout(() => res({
      loaded: true, open: studio.classList.contains('open'), secs, curBg: document.getElementById('st-cur-bg')?.textContent,
      fullscreenBtn: !!document.getElementById('btn-fs'), uploads: document.querySelectorAll('[data-upload]').length,
      sliderV: document.querySelector('[data-scale]')?.value, rawGlb: window.__ringEditor.lastRawGlb ? window.__ringEditor.lastRawGlb.size : 0
    }), 600));
  });
  console.log('studio open:', r.open, 'sections:', JSON.stringify(r.secs));
  console.log('bg label after change:', r.curBg);
  console.log('extras:', JSON.stringify({ fs: r.fullscreenBtn, uploads: r.uploads, sliderV: r.sliderV, rawGlbBytes: r.rawGlb }));
  console.log('pageErrors:', errs.length ? errs.slice(0, 3) : 'none');
  await b.close();
})();
