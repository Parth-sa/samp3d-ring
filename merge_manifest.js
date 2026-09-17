const fs = require('fs');
const path = require('path');
const manQuick = JSON.parse(fs.readFileSync('mirror_manifest.json', 'utf8'));
const byLocal = Object.fromEntries(manQuick.map(m => [m.local, m.remote]));
const files = fs.readdirSync('v2clone/mirror');
const out = []; const seen = new Set();
for (const f of files) {
  if (byLocal['mirror/' + f]) { out.push({ local: 'mirror/' + f, remote: byLocal['mirror/' + f] }); seen.add(f); continue; }
  if (/_png_preset\.bin$/.test(f)) {
    const base = f.replace(/_\d+__/, '').replace(/_png_preset\.bin$/, '');
    const remote = 'https://packs.ijewel3d.com/files/' + base + '.png?preset';
    out.push({ local: 'mirror/' + f, remote });
    seen.add(f);
  }
}
// engine bundles from the big walk (deterministic names)
const extra = [
  ['1__https___releases_ijewel3d_com_libs_webgi-v0_bundle-0_22_0_js.js', 'https://releases.ijewel3d.com/libs/webgi-v0/bundle-0.22.0.js'],
  ['2__https___releases_ijewel3d_com_libs_thumbnail-generator_0_0_20_lib_umd_js.js', 'https://releases.ijewel3d.com/libs/thumbnail-generator/0.0.20/lib/umd.js'],
  ['3__https___releases_ijewel3d_com_libs_mini-editor_0_4_17_bundle_iife_js.js', 'https://releases.ijewel3d.com/libs/mini-editor/0.4.17/bundle_iife.js'],
];
for (const [f, remote] of extra) {
  for (const [f, remote] of extra) {
  if (fs.existsSync(path.join('v2clone/mirror', f))) { out.push({ local: 'mirror/' + f, remote }); seen.add(f); }
}
if (fs.existsSync('v2clone/mirror/73__https___packs_ijewel3d_com_api_view_data_v1_.json')) out.push({ local: 'mirror/73__https___packs_ijewel3d_com_api_view_data_v1_.json', remote: 'https://packs.ijewel3d.com/api/view_data/v1/' });
}
const leftover = files.filter(f => !seen.has(f));
console.log('merged entries', out.length, 'leftover', leftover);
fs.writeFileSync('mirror_manifest.json', JSON.stringify(out, null, 1));
const mb = out.reduce((a, m) => a + fs.statSync(path.join('v2clone', m.local)).size, 0);
console.log('total mirror bytes', Math.round(mb / 1048576 * 10) / 10, 'MB');