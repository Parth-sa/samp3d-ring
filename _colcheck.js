const { chromium } = require('playwright-core');
(async () => {
  const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const url = 'https://1f4ddcc0.ring-options.pages.dev/ring-embed.html?model=assets/scene-9.glb&metal=%23e8eaed';
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 15; i++) {
    if (await p.evaluate(() => !!document.getElementById('loader')?.classList.contains('hidden'))) break;
    await p.waitForTimeout(2500);
  }
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const c = document.getElementById('webgi-canvas');
    const tmp = document.createElement('canvas');
    tmp.width = c.width; tmp.height = c.height;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const corners = [[5,5],[tmp.width-6,5],[5,tmp.height-6],[tmp.width-6,tmp.height-6]];
    const avg = (pts) => { let rs=0,gs=0,bs=0; for (const [x,y] of pts) { const i=(y*tmp.width+x)*4; rs+=d[i]; gs+=d[i+1]; bs+=d[i+2]; } return {r:Math.round(rs/pts.length), g:Math.round(gs/pts.length), b:Math.round(bs/pts.length)}; };
    const bg = avg(corners);
    let rings=[], nearWhite=0, sampled=0;
    for (let y=0;y<tmp.height;y+=8) for (let x=0;x<tmp.width;x+=8) {
      const i=(y*tmp.width+x)*4;
      const rr=d[i],gg=d[i+1],bb=d[i+2];
      const isBg = Math.abs(rr-bg.r)<14 && Math.abs(gg-bg.g)<14 && Math.abs(bb-bg.b)<14;
      if (!isBg) { sampled++; if (rr>200&&gg>200&&bb>200) nearWhite++; rings.push([rr,gg,bb]); }
    }
    const m=rings.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]);
    const n=Math.max(1,rings.length);
    return { bg, ringAvg:{r:Math.round(m[0]/n),g:Math.round(m[1]/n),b:Math.round(m[2]/n)}, ringPixels:rings.length, nearWhitePct:rings.length?Math.round(100*nearWhite/rings.length):0 };
  });
  console.log('bg:', JSON.stringify(r.bg), '| ring avg color:', JSON.stringify(r.ringAvg), '| ring px:', r.ringPixels, '| >200/200/200:', r.nearWhitePct + '%');
  await b.close();
})();