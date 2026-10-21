// Runs the pure parts of src/app.js in Node (no browser, no WebGL) and checks the .glb export.
// Usage: node tests/export_test.mjs   -> writes tests/out/*.glb and prints a summary; exits 1 on failure.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < 0) throw new Error('marker missing: ' + a + ' / ' + b); return src.slice(i, j); };
const sample = JSON.parse(fs.readFileSync(path.join(root, 'data/sample.json'), 'utf8'));
const code = `
const THREE={Color:class{constructor(h){const n=parseInt(h.slice(1),16);const f=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)};this.r=f(n>>16&255);this.g=f(n>>8&255);this.b=f(n&255);}}};
const atob=s=>Buffer.from(s,'base64').toString('binary');const btoa=s=>Buffer.from(s,'binary').toString('base64');
const SAMPLE=${JSON.stringify(sample)};
${cut('// ---------- parts ----------', '// ---------- three setup ----------')}
function refreshPalLin(){}
${cut('// ---------- encode / decode ----------', '// ---------- local autosave ----------')}
${cut('// ---------- body templates', '// ---------- GLB export ----------')}
${cut('// ---------- GLB export ----------', 'let pvState=null;')}
function load(o){S.name=o.name;S.w=o.w;S.h=o.h;S.d=o.d;S.unit=o.unit;S.palette=o.palette.slice();S.mats=S.palette.map((_,i)=>(o.mats&&o.mats[i])||0);S.grain=+o.grain||0;S.vox=new Map();
 const u=b64dec(o.vox);for(let i=0;i+4<u.length;i+=5)S.vox.set(K(u[i],u[i+1],u[i+2]),u[i+3]|(u[i+4]<<8));}
return {S,load,buildGLB,zip,toJSON,makeTemplate,TPL};`;
const api = new Function(code)();
const out = path.join(root, 'tests/out'); fs.mkdirSync(out, { recursive: true });
let fail = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
const parseGlb = buf => { const dv = new DataView(buf.buffer, buf.byteOffset); check(dv.getUint32(0, true) === 0x46546C67, 'glb magic'); check(dv.getUint32(8, true) === buf.length, 'glb length'); const jl = dv.getUint32(12, true); return JSON.parse(new TextDecoder().decode(buf.slice(20, 20 + jl))); };

api.load(sample);
check(api.toJSON().vox.length === sample.vox.length, 'sample round-trips through encode/decode');
let r = api.buildGLB(); let g = parseGlb(r.buf);
check(g.animations.map(a => a.name).join() === 'Idle,Walk,Run,Attack,Sit,Sleep', 'six animation clips');
check(g.nodes.length === 12, '12 bones');
check(r.tris > 0 && r.tris < 2000, `orc merges faces (${r.tris} tris)`);
fs.writeFileSync(path.join(out, 'orc.glb'), r.buf);
api.S.grain = 0.6; api.S.mats[api.S.palette.indexOf('#6B4423')] = 3; api.S.mats[api.S.palette.indexOf('#1E1A18')] = 5;
r = api.buildGLB(); g = parseGlb(r.buf);
check(g.materials.some(m => m.emissiveFactor) && g.materials.some(m => m.pbrMetallicRoughness.metallicFactor === 1), 'glow + metal materials exported');
check(api.buildGLB({ grain: false }).tris < r.tris, 'export without grain has fewer triangles');
for (const k of Object.keys(api.TPL)) { api.load(api.makeTemplate(k)); const t = api.buildGLB(); parseGlb(t.buf); check(t.height > 1 && t.height < 2.1, `template ${k}: ${t.height.toFixed(2)} m, ${t.tris} tris`); }
const z = api.zip([{ name: 'a.glb', data: r.buf }]); check(z.size > r.buf.length, 'zip built');
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
