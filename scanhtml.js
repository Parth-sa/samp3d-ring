const s = require('fs').readFileSync('ring-editor.html', 'utf8');
for (const k of ['btn-studio', 'ld-phase', 'st-sections', 'id=studio']) {
  const i = s.indexOf(k);
  console.log(k, 'first at', i, i >= 0 ? JSON.stringify(s.slice(Math.max(0, i - 50), i + 80)) : '');
}
console.log('len', s.length);