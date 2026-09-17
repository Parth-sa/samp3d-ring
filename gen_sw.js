const fs = require('fs');
const path = require('path');
const man = JSON.parse(fs.readFileSync('mirror_manifest.json', 'utf8'));
let total = 0;
for (const m of man) { total += fs.statSync(path.join('v2clone', m.local)).size; }
console.log('manifest entries', man.length, 'bytes', total);

const ct = (u) => {
  const p = u.split('?')[0].split('/').pop().toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.exr')) return 'image/x-exr';
  if (p.endsWith('.hdr')) return 'image/vnd.radiance';
  if (p.endsWith('.js')) return 'application/javascript';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.wasm')) return 'application/wasm';
  if (p.endsWith('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
};

const M = man.map(m => ({ r: m.remote, l: m.local }));

const sw = `const C='v2x2';
const TARGETS=['packs.ijewel3d.com','releases.ijewel3d.com','storage.googleapis.com'];
const MAP=${JSON.stringify(Object.fromEntries(M.map(m => [m.r, m.l])))};
const MISS=['packs.ijewel3d.com'];
const ct=(u)=>{const p=u.split('?')[0].split('/').pop().toLowerCase();
 if(p.endsWith('.png'))return'image/png'; if(p.endsWith('.jpg')||p.endsWith('.jpeg'))return'image/jpeg';
 if(p.endsWith('.webp'))return'image/webp'; if(p.endsWith('.exr'))return'image/x-exr'; if(p.endsWith('.hdr'))return'image/vnd.radiance';
 if(p.endsWith('.js'))return'application/javascript'; if(p.endsWith('.json'))return'application/json';
 if(p.endsWith('.wasm'))return'application/wasm'; if(p.endsWith('.glb'))return'model/gltf-binary'; return'application/octet-stream';};
self.addEventListener('install',(e)=>{e.waitUntil(self.skipWaiting())});
self.addEventListener('activate',(e)=>{e.waitUntil(clients.claim())});
self.addEventListener('fetch',(e)=>{
 const u=e.request.url; if(e.request.method!=='GET')return;
 let host=null; try{host=new URL(u).host}catch(x){return}
 if(!TARGETS.includes(host))return;
 e.respondWith((async()=>{
  const c=await caches.open(C);
  const hit=await c.match(u,{ignoreSearch:true});
  if(hit)return hit;
  if(MAP[u]){try{const res=await fetch(MAP[u],{cache:'no-store'});
    if(res.ok){const h=new Headers(res.headers);h.set('Access-Control-Allow-Origin','*');h.set('Content-Type',ct(u));
     const rr=new Response(res.body,{status:200,headers:h}); await c.put(u,rr.clone()); return rr;}}catch(err){return new Response('',{status:504})}}
  try{const res=await fetch(e.request); if(res&&res.ok&&MISS.some(h=>u.includes(h)))await c.put(u,res.clone()); return res;}
  catch(err){return new Response('',{status:504})}
 })());
});`;
fs.writeFileSync('v2clone/sw.js', sw);
console.log('sw.js', sw.length, 'bytes');

let html = fs.readFileSync('v2clone/index.html', 'utf8');
if (!html.includes('serviceWorker.register')) {
  const reg = `<script>if('serviceWorker'in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js').catch(function(){})})}</script>`;
  html = html.replace(/<script type="module" crossorigin src="\.?\/?assets\/index-BqPefU4L\.js"><\/script>/, reg + '\n    <script type="module" crossorigin src="assets/index-BqPefU4L.js"></script>');
  const ok = html.includes(reg.split('\n')[0]);
  fs.writeFileSync('v2clone/index.html', html);
  console.log('index.html: SW registered ->', ok);
}