const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://ring-options.pages.dev/ring-editor?lite=1&model=m09_sigli_head.glb');
  let snap = null;
  for (let i = 0; i < 10; i++) {
    snap = await p.evaluate(() => ({
      hidden: document.getElementById('loader').classList.contains('hidden'),
      steps: Array.from(document.querySelectorAll('#ld-steps .lds')).map(li => li.className + ' ' + li.textContent.trim()),
      phase: document.getElementById('ld-phase').textContent
    }));
    console.log(i, JSON.stringify({ hidden: snap.hidden, n: snap.steps.length, phase: snap.phase }));
    if (snap.hidden && snap.steps.length === 8 && snap.phase.includes('of 8')) { console.log('steps ok:', JSON.stringify(snap.steps.map(s=>s.trim()).slice(0,12))); break; }
    await p.waitForTimeout(3000);
  }
  console.log('final meters done');
  console.log('pageErrors:', errs.length ? errs.slice(0,3) : 'none');
  await b.close();
})();
