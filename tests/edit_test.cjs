// Checks place / mirror / box / fill / erase / undo logic from src/app.js with stubs.
// Usage: node tests/edit_test.cjs
const fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','src','app.js'),'utf8');
const cut=(a,b)=>s.slice(s.indexOf(a),s.indexOf(b));
let code="var THREE={};\n"+cut('// ---------- parts ----------','// ---------- three setup ----------').replace(/const partLin=.*\n/,'')
 +cut('// ---------- voxel storage & meshing ----------','// ---------- encode / decode ----------')
 +cut('// ---------- edits ----------','// ---------- picking ----------');
code+=`
function flush(){dirtyChunks.clear();} function scheduleLocal(){} function updateUndo(){} function toast(){}
function renderPalette(){} function renderParts(){}
var marker={visible:false,position:{set(){}}}; var document={getElementById:()=>({hidden:true})};
S.w=10;S.h=10;S.d=10;sliceTop=10;const n=()=>S.vox.size;let fail=0;const ok=(c,m)=>{console.log((c?'ok   ':'FAIL ')+m);if(!c)fail++;};
tool='place';mode='one';curColor=3;curPart=3;
handleHit({cell:null,adj:[2,0,5]});ok(n()===2&&S.vox.get(K(2,0,5))===(3|(3<<8))&&S.vox.get(K(7,0,5))===(3|(5<<8)),'place mirrors with left/right part swap');
handleHit({cell:[2,0,5],adj:[2,1,5]});ok(n()===4&&S.vox.get(K(2,1,5))>>8===3,'placing on a block inherits its part');
mode='box';handleHit({cell:null,adj:[0,0,0]});handleHit({cell:null,adj:[2,0,2]});ok(n()===22,'box place (mirrored)');
mode='fill';tool='paint';curColor=5;handleHit({cell:[0,0,0],adj:null});let c5=0;for(const v of S.vox.values())if((v&255)===5)c5++;ok(c5===18,'connected paint');
mode='one';tool='erase';handleHit({cell:[2,1,5],adj:null});ok(n()===20,'erase (mirrored)');
undo();ok(n()===22,'undo');redo();ok(n()===20,'redo');
tool='part';mode='fill';curPart=7;handleHit({cell:[0,0,0],adj:null});let p7=0,p9=0;for(const v of S.vox.values()){if(v>>8===7)p7++;if(v>>8===9)p9++;}ok(p7===9&&p9===9,'part fill mirrors to the other side');
console.log(fail?fail+' failed':'all passed');process.exit(fail?1:0);`;
new Function(code)();
