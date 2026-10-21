import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const SAMPLE = /*__SAMPLE__*/null;

// ---------- parts ----------
const PARTS=[
 {n:'胴',c:'#6F9BD1',b:'Spine'},{n:'腰',c:'#3F6696',b:'Hips'},{n:'頭',c:'#E3B341',b:'Head'},
 {n:'左上腕',c:'#5DBB7E',b:'UpperArm.L'},{n:'左前腕',c:'#2F8452',b:'LowerArm.L'},
 {n:'右上腕',c:'#E57A66',b:'UpperArm.R'},{n:'右前腕',c:'#B04A39',b:'LowerArm.R'},
 {n:'左もも',c:'#9C83D6',b:'UpperLeg.L'},{n:'左すね',c:'#634AA0',b:'LowerLeg.L'},
 {n:'右もも',c:'#DD8CC2',b:'UpperLeg.R'},{n:'右すね',c:'#A1527F',b:'LowerLeg.R'}];
const MIRROR_PART=[0,1,2,5,6,3,4,9,10,7,8];
const MATS=[{n:'標準',s:'',r:.85,m:0},{n:'布',s:'布',r:1,m:0},{n:'肌',s:'肌',r:.55,m:0},{n:'金属',s:'金',r:.3,m:1},{n:'つや',s:'艶',r:.15,m:0},{n:'光る',s:'光',r:1,m:0,glow:1}];
function grainLevel(x,y,z){let h=(Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791))>>>0;h=Math.imul(h^(h>>>13),1274126177)>>>0;h=(h^(h>>>16))>>>0;return(h%5)-2;}
const grainF=lv=>1+lv*0.07*S.grain;
const partLin=PARTS.map(p=>{const c=new THREE.Color(p.c);return[c.r,c.g,c.b]});

// ---------- state ----------
const S={name:'',w:64,h:96,d:64,unit:2.5,palette:[],mats:[],grain:0,vox:new Map(),pid:null,cloudChunks:0,dirty:false};
const K=(x,y,z)=>x|(y<<8)|(z<<16);
const KX=k=>k&255, KY=k=>(k>>8)&255, KZ=k=>k>>>16;
let tool='place', mode='one', mirror=true, curColor=1, curPart=0, partView=false, sliceTop=96;
let palLin=[]; const undoS=[], redoS=[];
const chunkVox=new Map(), chunkMesh=new Map(), dirtyChunks=new Set();
const CK=(x,y,z)=>(x>>4)|((y>>4)<<8)|((z>>4)<<16);

// ---------- three setup ----------
const stage=document.getElementById('stage');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);
const scene=new THREE.Scene();
const cam=new THREE.PerspectiveCamera(40,1,0.5,2000);
const ctl=new OrbitControls(cam,renderer.domElement);
ctl.enableDamping=true;ctl.dampingFactor=.15;
ctl.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
const envTex=(()=>{try{const pm=new THREE.PMREMGenerator(renderer);return pm.fromScene(new RoomEnvironment(),0.04).texture;}catch(e){return null;}})();
scene.environment=envTex;
scene.add(new THREE.HemisphereLight(0xfff3e2,0x4c4136,.7));
const sun=new THREE.DirectionalLight(0xffffff,1.5);sun.position.set(.6,1,.8);scene.add(sun);
const sun2=new THREE.DirectionalLight(0xffffff,.35);sun2.position.set(-.7,.3,-.6);scene.add(sun2);
const edMats=MATS.map(t=>t.glow?new THREE.MeshBasicMaterial({vertexColors:true}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:t.r,metalness:t.m,envMapIntensity:.8}));
const world=new THREE.Group();scene.add(world);
let floor,gridLines,boundBox,refPlane=null,refTex=null,refSide='front',refOpacity=.6;
const marker=new THREE.Mesh(new THREE.BoxGeometry(1.04,1.04,1.04),new THREE.MeshBasicMaterial({color:0xB8693F,wireframe:true}));
marker.visible=false;scene.add(marker);

function resize(){const r=stage.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);cam.aspect=r.width/r.height;cam.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);

function setupWorld(){
  [floor,gridLines,boundBox].forEach(o=>{if(o){scene.remove(o);o.geometry.dispose();}});
  const {w,h,d}=S;
  floor=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0x8a7a66,transparent:true,opacity:.12,side:THREE.DoubleSide}));
  floor.rotation.x=-Math.PI/2;scene.add(floor);
  const pts=[];
  for(let x=0;x<=w;x++){pts.push(x-w/2,0.01,-d/2,x-w/2,0.01,d/2);}
  for(let z=0;z<=d;z++){pts.push(-w/2,0.01,z-d/2,w/2,0.01,z-d/2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  gridLines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x7a6a56,transparent:true,opacity:.18}));scene.add(gridLines);
  boundBox=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),new THREE.LineBasicMaterial({color:0x7a6a56,transparent:true,opacity:.35}));
  boundBox.position.y=h/2;scene.add(boundBox);
  document.getElementById('slice').max=h;
  placeRef();
}
function frame(view){
  const {w,h,d}=S;const ext=Math.max(w,h,d);
  let ys=0,cnt=0;for(const k of S.vox.keys()){ys+=KY(k);cnt++;} const cy=cnt?ys/cnt+.5:h*.4;
  ctl.target.set(0,Math.min(cy,h*.6),0);
  if(view==='side')cam.position.set(ext*1.9,cy+ext*.1,0.001);
  else if(view==='front')cam.position.set(0.001,cy+ext*.1,ext*1.9);
  else cam.position.set(ext*.95,cy+ext*.55,ext*1.55);
  cam.far=ext*12;cam.updateProjectionMatrix();ctl.update();
}

// ---------- voxel storage & meshing ----------
const FACES=[[[1,0,0],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]],[[-1,0,0],[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]],
 [[0,1,0],[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]],[[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
 [[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],[[0,0,-1],[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]]];
function inB(x,y,z){return x>=0&&y>=0&&z>=0&&x<S.w&&y<S.h&&z<S.d}
function vis(x,y,z){return inB(x,y,z)&&y<sliceTop&&S.vox.has(K(x,y,z))}
function markDirty(x,y,z){for(const [dx,dy,dz] of [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const a=x+dx,b=y+dy,c=z+dz;if(inB(a,b,c))dirtyChunks.add(CK(a,b,c));}}
function setRaw(k,v){
  const x=KX(k),y=KY(k),z=KZ(k),ck=CK(x,y,z);
  if(v<0){S.vox.delete(k);const s=chunkVox.get(ck);if(s){s.delete(k);if(!s.size)chunkVox.delete(ck);}}
  else{S.vox.set(k,v);let s=chunkVox.get(ck);if(!s){s=new Set();chunkVox.set(ck,s);}s.add(k);}
  markDirty(x,y,z);
}
function buildChunk(ck){
  const old=chunkMesh.get(ck);if(old){world.remove(old);old.geometry.dispose();chunkMesh.delete(ck);}
  const set=chunkVox.get(ck);if(!set||!set.size)return;
  const B=MATS.map(()=>({pos:[],nor:[],col:[]})),hw=S.w/2,hd=S.d/2;
  for(const k of set){
    const x=KX(k),y=KY(k),z=KZ(k);if(y>=sliceTop)continue;
    const v=S.vox.get(k),ci=v&255;let rgb=partView?partLin[v>>8]:(palLin[ci-1]||[1,0,1]);
    const t=partView?0:(S.mats[ci-1]||0);
    if(!partView&&S.grain>0){const f=grainF(grainLevel(x,y,z));rgb=[rgb[0]*f,rgb[1]*f,rgb[2]*f];}
    const b=B[t];
    for(const [n,cs] of FACES){
      if(vis(x+n[0],y+n[1],z+n[2]))continue;
      for(const i of [0,1,2,0,2,3]){const c=cs[i];b.pos.push(x+c[0]-hw,y+c[1],z+c[2]-hd);b.nor.push(n[0],n[1],n[2]);b.col.push(rgb[0],rgb[1],rgb[2]);}
    }
  }
  const pos=[],nor=[],col=[];const g=new THREE.BufferGeometry();
  B.forEach((b,t)=>{if(!b.pos.length)return;g.addGroup(pos.length/3,b.pos.length/3,t);for(const a of b.pos)pos.push(a);for(const a of b.nor)nor.push(a);for(const a of b.col)col.push(a);});
  if(!pos.length){g.dispose();return;}
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.computeBoundingSphere();g.computeBoundingBox();
  const m=new THREE.Mesh(g,edMats);world.add(m);chunkMesh.set(ck,m);
}
function flush(){for(const ck of dirtyChunks)buildChunk(ck);dirtyChunks.clear();updateStatus();}
function rebuildAll(){for(const [ck,m] of chunkMesh){world.remove(m);m.geometry.dispose();}chunkMesh.clear();for(const ck of chunkVox.keys())buildChunk(ck);dirtyChunks.clear();updateStatus();}
function refreshPalLin(){palLin=S.palette.map(h=>{const c=new THREE.Color(h);return[c.r,c.g,c.b]});}

// ---------- encode / decode ----------
function b64enc(u8){let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s);}
function b64dec(s){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
function encodeVox(){const u=new Uint8Array(S.vox.size*5);let i=0;for(const [k,v] of S.vox){u[i++]=KX(k);u[i++]=KY(k);u[i++]=KZ(k);u[i++]=v&255;u[i++]=v>>8;}return b64enc(u);}
function toJSON(){return{app:'voxel-studio',v:2,name:S.name,w:S.w,h:S.h,d:S.d,unit:S.unit,palette:S.palette,mats:S.mats,grain:S.grain,vox:encodeVox()};}
function loadProject(o,{pid=null,cloudChunks=0}={}){
  if(!o||!o.w||!o.h||!o.d||!Array.isArray(o.palette))throw new Error('作品ファイルの形式が違います');
  S.name=o.name||'無題';S.w=o.w;S.h=o.h;S.d=o.d;S.unit=o.unit||2.5;S.palette=o.palette.slice();S.mats=S.palette.map((_,i)=>(Array.isArray(o.mats)&&o.mats[i])||0);S.grain=+o.grain||0;S.pid=pid;S.cloudChunks=cloudChunks;S.dirty=false;
  S.vox=new Map();chunkVox.clear();
  const u=o.vox?b64dec(o.vox):new Uint8Array(0);
  for(let i=0;i+4<u.length;i+=5){const k=K(u[i],u[i+1],u[i+2]);const v=u[i+3]|(u[i+4]<<8);S.vox.set(k,v);const ck=CK(u[i],u[i+1],u[i+2]);let s=chunkVox.get(ck);if(!s){s=new Set();chunkVox.set(ck,s);}s.add(k);}
  sliceTop=S.h;document.getElementById('slice').value=S.h;
  undoS.length=0;redoS.length=0;curColor=Math.min(curColor,S.palette.length)||1;
  document.getElementById('grain').value=S.grain;refreshPalLin();setupWorld();rebuildAll();renderPalette();renderParts();updateName();frame();updateUndo();
}

// ---------- local autosave ----------
const LS='voxel-studio-current';let saveTimer=null;
function scheduleLocal(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(LS,JSON.stringify({...toJSON(),pid:S.pid,cloudChunks:S.cloudChunks,dirty:S.dirty}));}catch(e){}},700);}

// ---------- edits ----------
function commit(changes){
  const rec=[];
  for(const [k,a] of changes){const b=S.vox.has(k)?S.vox.get(k):-1;if(a===b)continue;rec.push([k,b,a]);setRaw(k,a);}
  if(!rec.length)return;
  undoS.push(rec);if(undoS.length>120)undoS.shift();redoS.length=0;
  S.dirty=true;flush();scheduleLocal();updateUndo();
}
function undo(){const r=undoS.pop();if(!r)return;for(let i=r.length-1;i>=0;i--)setRaw(r[i][0],r[i][1]);redoS.push(r);S.dirty=true;flush();scheduleLocal();updateUndo();}
function redo(){const r=redoS.pop();if(!r)return;for(const [k,,a] of r)setRaw(k,a);undoS.push(r);S.dirty=true;flush();scheduleLocal();updateUndo();}
function updateUndo(){document.getElementById('undoBtn').disabled=!undoS.length;document.getElementById('redoBtn').disabled=!redoS.length;}
const mx=x=>S.w-1-x;
function addChange(ch,x,y,z,fn){
  if(!inB(x,y,z))return;
  const k=K(x,y,z);const cur=ch.has(k)?ch.get(k):(S.vox.has(k)?S.vox.get(k):-1);
  const nv=fn(cur,false);if(nv!==undefined)ch.set(k,nv);
  if(mirror){const x2=mx(x);if(x2!==x){const k2=K(x2,y,z);const cur2=ch.has(k2)?ch.get(k2):(S.vox.has(k2)?S.vox.get(k2):-1);const nv2=fn(cur2,true);if(nv2!==undefined)ch.set(k2,nv2);}}
}
function opFn(srcPart){
  if(tool==='place')return(cur,m)=>{const p=m?MIRROR_PART[srcPart]:srcPart;return curColor|(p<<8)};
  if(tool==='erase')return(cur)=>cur<0?undefined:-1;
  if(tool==='paint')return(cur)=>cur<0?undefined:(curColor|(cur&0xff00));
  if(tool==='part')return(cur,m)=>cur<0?undefined:((cur&255)|((m?MIRROR_PART[curPart]:curPart)<<8));
}
function flood(start,match){
  const out=[start],seen=new Set([start]);
  for(let i=0;i<out.length&&out.length<400000;i++){
    const k=out[i],x=KX(k),y=KY(k),z=KZ(k);
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const a=x+dx,b=y+dy,c=z+dz;if(!vis(a,b,c))continue;const n=K(a,b,c);if(seen.has(n))continue;
      if(match(S.vox.get(n))){seen.add(n);out.push(n);}
    }
  }
  return out;
}
let boxStart=null;
function handleHit(hit){
  // hit: {cell:[x,y,z] voxel or null, adj:[x,y,z]}
  if(tool==='pick'){
    if(!hit.cell)return;const v=S.vox.get(K(...hit.cell));curColor=v&255;curPart=v>>8;renderPalette();renderParts();
    toast(`色${curColor}・${PARTS[curPart].n}を選びました`);return;
  }
  const target=tool==='place'?hit.adj:hit.cell;if(!target)return;
  const srcPart=hit.cell?(S.vox.get(K(...hit.cell))>>8):curPart;
  const fn=opFn(tool==='place'&&!hit.cell?curPart:srcPart);
  const ch=new Map();
  if(mode==='box'){
    if(!boxStart){boxStart={p:target,part:srcPart};marker.position.set(target[0]-S.w/2+.5,target[1]+.5,target[2]-S.d/2+.5);marker.visible=true;document.getElementById('boxHint').hidden=false;return;}
    const a=boxStart.p,b=target;const f2=tool==='place'?opFn(boxStart.part):fn;
    for(let x=Math.min(a[0],b[0]);x<=Math.max(a[0],b[0]);x++)for(let y=Math.min(a[1],b[1]);y<=Math.max(a[1],b[1]);y++)for(let z=Math.min(a[2],b[2]);z<=Math.max(a[2],b[2]);z++)addChange(ch,x,y,z,f2);
    cancelBox();
  }else if(mode==='fill'&&tool!=='place'){
    const k0=K(...target),v0=S.vox.get(k0);
    const match=tool==='part'?(v=>v===v0):(v=>(v&255)===(v0&255));
    for(const k of flood(k0,match))addChange(ch,KX(k),KY(k),KZ(k),fn);
  }else addChange(ch,...target,fn);
  commit(ch);
}
function cancelBox(){boxStart=null;marker.visible=false;document.getElementById('boxHint').hidden=true;}

// ---------- picking ----------
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
function pick(cx,cy){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.set((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1);ray.setFromCamera(ndc,cam);
  const hits=ray.intersectObjects([...chunkMesh.values(),floor],false);if(!hits.length)return null;
  const h=hits[0],p=h.point;
  if(h.object===floor){const c=[Math.floor(p.x+S.w/2),0,Math.floor(p.z+S.d/2)];return inB(...c)?{cell:null,adj:c}:null;}
  const n=h.face.normal;
  const c=[Math.floor(p.x+S.w/2-n.x*.5),Math.floor(p.y-n.y*.5),Math.floor(p.z+S.d/2-n.z*.5)];
  if(!S.vox.has(K(...c)))return null;
  const a=[c[0]+Math.round(n.x),c[1]+Math.round(n.y),c[2]+Math.round(n.z)];
  return{cell:c,adj:inB(...a)&&!(a[1]>=sliceTop)?a:null};
}
const ptrs=new Map();let tapOk=false,tapStart=null;
renderer.domElement.addEventListener('pointerdown',e=>{ptrs.set(e.pointerId,1);if(ptrs.size===1){tapOk=true;tapStart={x:e.clientX,y:e.clientY,t:performance.now()};}else tapOk=false;});
renderer.domElement.addEventListener('pointermove',e=>{if(tapOk&&tapStart&&Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>8)tapOk=false;});
const endPtr=e=>{const was=ptrs.has(e.pointerId);ptrs.delete(e.pointerId);
  if(was&&tapOk&&ptrs.size===0&&performance.now()-tapStart.t<450&&e.type==='pointerup'){tapOk=false;const h=pick(e.clientX,e.clientY);if(h)handleHit(h);}
  if(!ptrs.size)tapOk=false;};
renderer.domElement.addEventListener('pointerup',endPtr);
renderer.domElement.addEventListener('pointercancel',endPtr);

// ---------- reference image ----------
function placeRef(){
  if(refPlane){scene.remove(refPlane);refPlane.geometry.dispose();refPlane.material.dispose();refPlane=null;}
  if(!refTex)return;
  const {w,h,d}=S;const img=refTex.image;const ar=img.width/img.height;
  const bw=refSide==='front'?w:d;let pw=bw,ph=bw/ar;if(ph>h){ph=h;pw=h*ar;}
  refPlane=new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),new THREE.MeshBasicMaterial({map:refTex,transparent:true,opacity:refOpacity,depthWrite:false,side:THREE.DoubleSide}));
  if(refSide==='front'){refPlane.position.set(0,ph/2,-d/2-.05);}
  else{refPlane.rotation.y=Math.PI/2;refPlane.position.set(-w/2-.05,ph/2,0);}
  refPlane.renderOrder=-1;scene.add(refPlane);
}
document.getElementById('refPick').onclick=()=>document.getElementById('refFile').click();
function setRefFromBlob(f){const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{if(refTex)refTex.dispose();refTex=new THREE.Texture(img);refTex.colorSpace=THREE.SRGBColorSpace;refTex.needsUpdate=true;placeRef();frame(refSide);toast('下絵を置きました');};img.onerror=()=>toast('この画像は読み込めませんでした');img.src=r.result;};r.readAsDataURL(f);}
document.getElementById('refFile').onchange=e=>{const f=e.target.files[0];if(!f)return;setRefFromBlob(f);e.target.value='';};
document.getElementById('refSide').onclick=e=>{const b=e.target.closest('button');if(!b)return;refSide=b.dataset.side;setPressed('refSide','side',refSide);placeRef();if(refTex)frame(refSide);};
document.getElementById('refClear').onclick=()=>{if(refTex){refTex.dispose();refTex=null;}placeRef();};
document.getElementById('refOpacity').oninput=e=>{refOpacity=+e.target.value;if(refPlane)refPlane.material.opacity=refOpacity;};

// ---------- UI ----------
function setPressed(id,attr,val){document.querySelectorAll(`#${id} button`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[attr]===val)));}
document.getElementById('tools').onclick=e=>{const b=e.target.closest('button');if(!b)return;tool=b.dataset.tool;setPressed('tools','tool',tool);cancelBox();
  const pv=tool==='part';if(pv!==partView){partView=pv;document.getElementById('partViewBtn').setAttribute('aria-pressed',String(pv));rebuildAll();}
  renderParts();};
document.getElementById('modes').onclick=e=>{const b=e.target.closest('button');if(!b)return;mode=b.dataset.mode;setPressed('modes','mode',mode);cancelBox();};
document.getElementById('boxCancel').onclick=cancelBox;
document.getElementById('mirrorBtn').onclick=e=>{mirror=!mirror;e.currentTarget.setAttribute('aria-pressed',String(mirror));};
document.getElementById('partViewBtn').onclick=e=>{partView=!partView;e.currentTarget.setAttribute('aria-pressed',String(partView));rebuildAll();renderParts();};
document.getElementById('slice').oninput=e=>{sliceTop=+e.target.value;document.getElementById('sliceVal').textContent=sliceTop>=S.h?'全部':`下から${sliceTop}段`;rebuildAll();};
let grainRaf=0;document.getElementById('grain').oninput=e=>{S.grain=+e.target.value;S.dirty=true;cancelAnimationFrame(grainRaf);grainRaf=requestAnimationFrame(()=>{rebuildAll();scheduleLocal();});};
document.getElementById('viewFront').onclick=()=>frame('front');
document.getElementById('viewSide').onclick=()=>frame('side');
document.getElementById('undoBtn').onclick=undo;document.getElementById('redoBtn').onclick=redo;
addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();e.shiftKey?redo():undo();}});

const colorInput=document.getElementById('colorInput');let colorTarget=0;
function renderPalette(){
  const el=document.getElementById('palette');el.innerHTML='';
  S.palette.forEach((h,i)=>{const b=document.createElement('button');b.className='sw';b.id='sw'+i;b.style.background=h;b.setAttribute('aria-label',`色${i+1} ${h}`);b.setAttribute('aria-pressed',String(curColor===i+1));
    const mt=MATS[S.mats[i]||0];if(mt.s){b.dataset.mat=mt.s;b.setAttribute('aria-label',`色${i+1} ${h} ${mt.n}`);}
    b.onclick=()=>{if(curColor===i+1)showColorSheet(i+1);else{curColor=i+1;renderPalette();}};el.appendChild(b);});
  const add=document.createElement('button');add.className='sw add';add.textContent='+';add.setAttribute('aria-label','色を増やす');
  add.onclick=()=>{if(S.palette.length>=250)return toast('色はこれ以上増やせません');colorTarget=0;colorInput.value=S.palette[curColor-1]||'#888888';colorInput.click();};el.appendChild(add);
  const sel=el.querySelector('[aria-pressed="true"]');if(sel)sel.scrollIntoView({block:'nearest',inline:'nearest'});
}
colorInput.addEventListener('change',()=>{const h=colorInput.value.toUpperCase();
  if(colorTarget===0){S.palette.push(h);S.mats.push(0);curColor=S.palette.length;}else{S.palette[colorTarget-1]=h;}
  S.dirty=true;refreshPalLin();renderPalette();if(colorTarget)rebuildAll();scheduleLocal();
  if(colorTarget&&document.getElementById('ceColor'))showColorSheet(colorTarget);});
function renderParts(){
  const el=document.getElementById('parts');el.hidden=!(tool==='part'||partView);el.innerHTML='';
  PARTS.forEach((p,i)=>{const b=document.createElement('button');b.className='pchip';b.id='pc'+i;b.setAttribute('aria-pressed',String(curPart===i));
    b.innerHTML=`<i style="background:${p.c}"></i>${p.n}`;b.onclick=()=>{curPart=i;renderParts();};el.appendChild(b);});
}
function updateName(){document.getElementById('nameBtn').textContent=S.name||'無題';}
function updateStatus(){document.getElementById('status').innerHTML=`${S.vox.size.toLocaleString()} マス<br>${S.w}×${S.h}×${S.d} ・ 1マス ${S.unit}cm${S.dirty?' ・ 未保存の変更あり':''}`;
  document.getElementById('sliceVal').textContent=sliceTop>=S.h?'全部':`下から${sliceTop}段`;}
let toastT;function toast(m){const t=document.getElementById('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,2600);}

// refine x2
document.getElementById('refineBtn').onclick=()=>{
  if(S.w*2>255||S.h*2>255||S.d*2>255)return toast('これ以上は細かくできません（最大255マス）');
  if(S.vox.size*8>700000)return toast('マスが多すぎて細かくできません');
  const old=[...S.vox];S.w*=2;S.h*=2;S.d*=2;S.unit=S.unit/2;S.vox=new Map();chunkVox.clear();
  for(const [k,v] of old){const x=KX(k)*2,y=KY(k)*2,z=KZ(k)*2;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++){const nk=K(x+a,y+b,z+c);S.vox.set(nk,v);const ck=CK(x+a,y+b,z+c);let s=chunkVox.get(ck);if(!s){s=new Set();chunkVox.set(ck,s);}s.add(nk);}}
  sliceTop=S.h;document.getElementById('slice').value=S.h;undoS.length=0;redoS.length=0;S.dirty=true;
  setupWorld();rebuildAll();frame();updateUndo();scheduleLocal();toast(`細かくしました（1マス ${S.unit}cm）`);};

// ---------- sheets ----------
const sheet=document.getElementById('sheet'),card=document.getElementById('sheetCard');
let onSheetClose=null;
function openSheet(html){card.innerHTML=html;sheet.hidden=false;}
function closeSheet(){sheet.hidden=true;card.innerHTML='';if(onSheetClose){onSheetClose();onSheetClose=null;}}
sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet();});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

document.getElementById('nameBtn').onclick=()=>{
  openSheet(`<h2>名前を変える</h2><div class="field"><input id="nameInput" maxlength="40" value="${esc(S.name)}"><button class="btn primary" id="nameOk">決定</button></div>`);
  const i=document.getElementById('nameInput');i.focus();i.select();
  const ok=()=>{S.name=i.value.trim()||'無題';S.dirty=true;updateName();updateStatus();scheduleLocal();closeSheet();};
  document.getElementById('nameOk').onclick=ok;i.onkeydown=e=>{if(e.key==='Enter')ok();};
};

// ---------- color editing ----------
function showColorSheet(ci){
  const orig=S.palette.slice();let scope='one';
  const cnt=()=>{let n=0;for(const v of S.vox.values())if((v&255)===ci)n++;return n;};
  openSheet(`<h2>色${ci}の編集</h2>
   <div class="row"><span class="sw" id="cePrev" style="background:${S.palette[ci-1]};cursor:default"></span><span class="facts" id="ceInfo">${S.palette[ci-1]} ・ ${cnt().toLocaleString()} マス</span><button class="btn" id="ceColor">色を変える</button></div>
   <h3>素材</h3>
   <div class="seg" id="ceMat">${MATS.map((m,j)=>`<button id="cm-${j}" data-m="${j}" aria-pressed="${(S.mats[ci-1]||0)===j}">${m.n}</button>`).join('')}</div>
   <h3>この色のブロックを別の色にまとめる</h3>
   <div class="row swatches" id="ceMerge">${S.palette.map((h,j)=>j+1===ci?'':`<button class="sw" id="cg-${j}" data-j="${j+1}" style="background:${h}" aria-label="色${j+1}にまとめる"></button>`).join('')}</div>
   <h3>色味をまとめて調整</h3>
   <div class="seg" id="ceScope"><button id="cs-one" data-s="one" aria-pressed="true">この色だけ</button><button id="cs-all" data-s="all" aria-pressed="false">全部の色</button></div>
   <div class="opts" style="margin-top:0">
    <label for="ceL">明るさ <input type="range" id="ceL" min="-40" max="40" value="0"></label>
    <label for="ceS">鮮やかさ <input type="range" id="ceS" min="-60" max="60" value="0"></label>
    <label for="ceH">色相 <input type="range" id="ceH" min="-60" max="60" value="0"></label>
   </div>
   <div class="row"><button class="btn" id="ceReset">調整をやめる</button><button class="btn primary" id="ceDone">閉じる</button></div>`);
  document.getElementById('ceColor').onclick=()=>{colorTarget=ci;colorInput.value=S.palette[ci-1];colorInput.click();};
  document.getElementById('ceMat').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.mats[ci-1]=+b.dataset.m;
    document.querySelectorAll('#ceMat button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));S.dirty=true;rebuildAll();renderPalette();scheduleLocal();};
  document.getElementById('ceMerge').onclick=e=>{const b=e.target.closest('button');if(!b)return;const to=+b.dataset.j;const ch=new Map();
    for(const [k,v] of S.vox)if((v&255)===ci)ch.set(k,to|(v&0xff00));commit(ch);curColor=to;renderPalette();closeSheet();toast(`色${ci}のブロックを色${to}にまとめました（元に戻すで戻せます）`);};
  let raf=0;const apply=()=>{const dl=+document.getElementById('ceL').value/100,ds=+document.getElementById('ceS').value/100,dh=+document.getElementById('ceH').value/360;
    S.palette=orig.map((h,j)=>{if(scope==='one'&&j+1!==ci)return h;const c=new THREE.Color(h),hsl={};c.getHSL(hsl,THREE.SRGBColorSpace);
      c.setHSL((hsl.h+dh+1)%1,Math.min(1,Math.max(0,hsl.s*(1+ds))),Math.min(1,Math.max(0,hsl.l+dl)),THREE.SRGBColorSpace);return '#'+c.getHexString(THREE.SRGBColorSpace).toUpperCase();});
    refreshPalLin();cancelAnimationFrame(raf);raf=requestAnimationFrame(rebuildAll);
    const p=document.getElementById('cePrev');if(p)p.style.background=S.palette[ci-1];};
  ['ceL','ceS','ceH'].forEach(id=>document.getElementById(id).oninput=apply);
  document.getElementById('ceScope').onclick=e=>{const b=e.target.closest('button');if(!b)return;scope=b.dataset.s;
    document.querySelectorAll('#ceScope button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));apply();};
  document.getElementById('ceReset').onclick=()=>{['ceL','ceS','ceH'].forEach(id=>document.getElementById(id).value=0);S.palette=orig.slice();refreshPalLin();rebuildAll();
    const p=document.getElementById('cePrev');if(p)p.style.background=S.palette[ci-1];};
  onSheetClose=()=>{if(S.palette.some((h,j)=>h!==orig[j])){S.dirty=true;scheduleLocal();}renderPalette();};
  document.getElementById('ceDone').onclick=closeSheet;
}

// ---------- cloud (db) ----------
let col=null,cloudState='wait';
(async()=>{try{
  const c=window.claude;if(!c||!c.use){cloudState='none';return;}
  const [db,user]=await Promise.all([c.use('db'),c.use('user')]);
  if(!db||!user){cloudState='none';return;}
  const uid=await user.id();if(!uid){cloudState='none';return;}
  col=db.collection('data/users/'+uid);cloudState='ok';
}catch(e){cloudState='none';}})();
const CH=180000;
async function saveCloud(btn){
  if(!col)return toast(cloudState==='wait'?'クラウドの準備中です。少し待ってからもう一度押してください':'この表示ではクラウド保存が使えません（端末内には自動保存されています）');
  const label=btn.textContent;btn.disabled=true;btn.textContent='保存中…';
  try{
    const pid=S.pid||('p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
    const data=encodeVox();const n=Math.max(1,Math.ceil(data.length/CH));
    for(let i=0;i<n;i++)await col.doc(`c_${pid}_${i}`).set({kind:'chunk',pid,i,d:data.slice(i*CH,(i+1)*CH)});
    await col.doc('m_'+pid).set({kind:'meta',pid,name:S.name,updatedAt:Date.now(),w:S.w,h:S.h,d:S.d,unit:S.unit,palette:S.palette,mats:S.mats,grain:S.grain,chunks:n,count:S.vox.size});
    for(let i=n;i<S.cloudChunks;i++)await col.doc(`c_${pid}_${i}`).delete();
    S.pid=pid;S.cloudChunks=n;S.dirty=false;updateStatus();scheduleLocal();toast('クラウドに保存しました');
  }catch(e){toast(e&&e.code==='quota_exceeded'?'保存先がいっぱいです。使わない作品を削除してください':'保存できませんでした。通信状態を確かめてもう一度押してください');}
  finally{btn.disabled=false;btn.textContent=label;}
}
document.getElementById('saveBtn').onclick=()=>showSave();
async function openCloud(meta){
  try{let d='';for(let i=0;i<meta.chunks;i++){const s=await col.doc(`c_${meta.pid}_${i}`).get();if(!s.exists)throw 0;d+=s.data().d;}
    loadProject({...meta,vox:d},{pid:meta.pid,cloudChunks:meta.chunks});scheduleLocal();closeSheet();toast(`「${meta.name}」を開きました`);
  }catch(e){toast('読み込めませんでした。もう一度試してください');}
}
async function deleteCloud(meta){
  try{for(let i=0;i<meta.chunks;i++)await col.doc(`c_${meta.pid}_${i}`).delete();await col.doc('m_'+meta.pid).delete();
    if(S.pid===meta.pid){S.pid=null;S.cloudChunks=0;S.dirty=true;updateStatus();}toast('削除しました');showOpen();}catch(e){toast('削除できませんでした');}
}
const PRESETS=[{n:'小',w:32,h:48,d:32,u:5},{n:'中',w:64,h:96,d:64,u:2.5},{n:'大',w:96,h:128,d:96,u:1.875}];
async function showOpen(){
  openSheet(`<h2>開く・新しく作る</h2>
   ${S.dirty?'<p class="note">今の作品にはクラウドに保存していない変更があります。別の作品を開くと、その変更はこの端末からも消えます。</p>':''}
   <h3>新しく作る</h3><div class="grid3">${PRESETS.map((p,i)=>`<button class="btn" id="np${i}">${p.n}<small>${p.w}×${p.h}×${p.d}</small><small>1マス ${p.u}cm</small></button>`).join('')}</div>
   <h3>素体から作る（パーツ分け済み）</h3><div class="grid3">${Object.keys(TPL).map((k,i)=>`<button class="btn" id="tp${i}">${k}<small>${TPL[k].note}</small></button>`).join('')}</div>
   <h3>ファイルから</h3>
   <div class="row"><button class="btn" id="openDrive">Googleドライブから開く</button><button class="btn" id="openJson">この端末から読み込む</button><button class="btn" id="openSample">サンプル：オーク</button></div>
   <h3>クラウドの作品</h3><div id="cloudList" class="note">読み込み中…</div>
   <button class="btn" id="closeS">閉じる</button>`);
  PRESETS.forEach((p,i)=>document.getElementById('np'+i).onclick=()=>{loadProject({name:'無題',w:p.w,h:p.h,d:p.d,unit:p.u,palette:SAMPLE.palette,vox:''});scheduleLocal();closeSheet();});
  document.getElementById('openSample').onclick=()=>{loadProject(SAMPLE);scheduleLocal();closeSheet();};
  Object.keys(TPL).forEach((k,i)=>document.getElementById('tp'+i).onclick=()=>{loadProject(makeTemplate(k));S.dirty=true;scheduleLocal();closeSheet();toast(`素体（${k}）から始めます`);});
  document.getElementById('openDrive').onclick=()=>showDrivePicker('json');
  document.getElementById('openJson').onclick=()=>document.getElementById('jsonFile').click();
  document.getElementById('closeS').onclick=closeSheet;
  const box=document.getElementById('cloudList');
  if(!col){box.textContent=cloudState==='wait'?'クラウドの準備中です。少し待って開き直してください。':'この表示ではクラウド保存が使えません。作品ファイルの保存・読み込みを使ってください。';return;}
  try{const snap=await col.where('kind','==','meta').get();
    const ms=snap.docs.map(s=>s.data()).sort((a,b)=>b.updatedAt-a.updatedAt);
    if(!document.getElementById('cloudList'))return;
    if(!ms.length){box.textContent='まだありません。上の「保存」でここに残ります。';return;}
    box.className='list';box.innerHTML=ms.map((m,i)=>`<div class="item"><button class="t" id="cm${i}"><b>${esc(m.name)}</b><span>${new Date(m.updatedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} ・ ${m.count.toLocaleString()} マス</span></button><button class="btn danger" id="cd${i}">削除</button></div>`).join('');
    ms.forEach((m,i)=>{document.getElementById('cm'+i).onclick=()=>openCloud(m);
      const del=document.getElementById('cd'+i);del.onclick=()=>{if(del.dataset.armed){deleteCloud(m);}else{del.dataset.armed='1';del.textContent='本当に削除';}};});
  }catch(e){box.textContent='一覧を読み込めませんでした。';}
}
document.getElementById('openBtn').onclick=showOpen;
document.getElementById('jsonFile').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{try{loadProject(JSON.parse(t));S.dirty=true;scheduleLocal();closeSheet();toast('作品ファイルを読み込みました');}catch(er){toast('読み込めませんでした：'+er.message);}});e.target.value='';};

// ---------- downloads ----------
async function offerFile(filename,data){
  const c=window.claude;const dl=c&&c.use?await c.use('downloads'):null;
  if(!dl){toast('この表示ではファイルを保存できません');return false;}
  try{await dl.save({filename,data});toast('保存しました');return true;}
  catch(e){if(e&&e.code==='declined')return false;toast(e&&e.code==='rate_limited'?'保存の確認が開いています。閉じてからもう一度押してください':'保存できませんでした');return false;}
}
const safeName=()=>(S.name||'character').replace(/[\\/:*?"<>|]/g,'_').slice(0,60);
document.getElementById('jsonOutBtn').onclick=()=>offerFile(safeName()+'.json',JSON.stringify(toJSON()));


// ---------- Google Drive ----------
const GD='Google Drive';let mcpNs=null,mcpState='wait';
(async()=>{try{const c=window.claude;if(!c||!c.use){mcpState='none';return;}mcpNs=await c.use('mcp');mcpState=mcpNs?'ok':'none';}catch(e){mcpState='none';}})();
function driveErr(e){const c=e&&e.code;
  if(c==='wait')return 'ドライブの準備中です。少し待ってからもう一度押してください';
  if(c==='none'||c==='not_granted'||c==='capability_disabled'||c==='capability_removed')return 'この表示ではGoogleドライブを使えません';
  if(c==='server_not_connected'||c==='server_not_found')return 'Googleドライブがつながっていません。claude.aiの設定→コネクタでGoogleドライブを追加してください';
  if(c==='needs_reauth')return 'Googleドライブの接続が切れています。claude.aiの設定→コネクタでつなぎ直してください';
  if(c==='not_in_manifest'||c==='approval_required'||c==='consent_required')return 'このページでのドライブ利用が許可されていません。ページの権限メニューで許可してください';
  if(c==='selection_required')return 'どのGoogleドライブを使うか選んでから、もう一度押してください';
  if(c==='too_big')return e.message;
  return 'ドライブとのやりとりに失敗しました'+(e&&e.message?'：'+e.message:'');}
async function gd(tool,input){if(!mcpNs)throw{code:mcpState==='wait'?'wait':'none',message:''};return mcpNs.callTool(GD,tool,input,{cache:false});}
function filesOf(r){const p=r&&r.payload;if(p&&Array.isArray(p.files))return p.files;if(Array.isArray(p))return p;return[];}
function idOf(r){const p=r&&r.payload;if(!p||typeof p!=='object')return null;return p.id||(p.file&&p.file.id)||null;}
function findB64(r){
  const p=r&&r.payload;const keys=['content','base64Content','data','blob','bytes','fileContent'];
  if(p&&typeof p==='object')for(const k of keys)if(typeof p[k]==='string'&&p[k].length)return p[k];
  const c=[];const walk=(v,d)=>{if(d>6||v==null)return;if(typeof v==='string'){if(v.length>8&&/^[A-Za-z0-9+/_=\-\s]+$/.test(v))c.push(v);return;}
    if(Array.isArray(v)){v.forEach(x=>walk(x,d+1));return;}if(typeof v==='object')for(const k of Object.keys(v))walk(v[k],d+1);};
  walk(p,0);if(!c.length)walk(r&&r.content,0);c.sort((a,b)=>b.length-a.length);return c[0]||null;}
async function downloadBytes(id){const r=await gd('download_file_content',{fileId:id});const s=findB64(r);
  if(!s)throw{code:'x',message:'ファイルの中身を受け取れませんでした'};return b64dec(s.replace(/-/g,'+').replace(/_/g,'/').replace(/\s/g,''));}
async function createInDrive({title,mime,text=null,bytes=null,parentId=null}){
  const input={title,contentMimeType:mime,disableConversionToGoogleType:true};if(parentId)input.parentId=parentId;
  if(text!=null&&text.length<800000)input.textContent=text;
  else{const data=bytes||new TextEncoder().encode(text);
    if(data.length<700000)input.base64Content=b64enc(data);
    else{const lt=await mcpNs.listTools().catch(()=>({}));if(!lt.fileArgs)throw{code:'too_big',message:'ファイルが大きすぎてドライブに送れません'};
      input.base64Content={$file:{data:new Blob([data],{type:mime}),name:title,type:mime}};}}
  return gd('create_file',input);}
const APP_FOLDER='ボクセル工房';
async function ensureAppFolder(){
  const q=`mimeType = 'application/vnd.google-apps.folder' and title = '${APP_FOLDER}'`;
  const f=filesOf(await gd('search_files',{query:q,pageSize:5,excludeContentSnippets:true}));if(f.length)return f[0].id;
  try{const r=await gd('create_file',{title:APP_FOLDER,contentMimeType:'application/vnd.google-apps.folder'});const id=idOf(r);if(id)return id;}catch(e){}
  return null;}
const FKEY='voxel-studio-drive-folder';
async function fillFolders(sel){
  if(!sel)return;let saved='__app';try{saved=localStorage.getItem(FKEY)||'__app';}catch(e){}
  sel.innerHTML=`<option value="__app">${APP_FOLDER}（なければ作ります）</option><option value="root">マイドライブ（一番上）</option>`;sel.value=saved==='root'?'root':'__app';
  sel.onchange=()=>{try{localStorage.setItem(FKEY,sel.value);}catch(e){}};
  if(!mcpNs){sel.disabled=true;return;}
  try{const fs=filesOf(await gd('search_files',{query:"mimeType = 'application/vnd.google-apps.folder'",pageSize:100,excludeContentSnippets:true}))
      .filter(f=>f.title!==APP_FOLDER).sort((a,b)=>String(a.title).localeCompare(String(b.title),'ja'));
    if(!sel.isConnected)return;
    for(const f of fs){const o=document.createElement('option');o.value=f.id;o.textContent=f.title;sel.appendChild(o);}
    if([...sel.options].some(o=>o.value===saved))sel.value=saved;}catch(e){}}
async function resolveParent(sel){const v=sel?sel.value:'__app';if(v==='root')return null;if(v==='__app')return ensureAppFolder();return v;}
const kb=n=>n?`${Math.max(1,Math.round(+n/1024)).toLocaleString()}KB`:'';
async function showDrivePicker(kind){
  const isJson=kind==='json';
  openSheet(`<h2>${isJson?'Googleドライブから開く':'ドライブから下絵を選ぶ'}</h2>
    <div class="field"><input id="dq" placeholder="名前で探す" aria-label="名前で探す"><button class="btn" id="dqBtn">探す</button></div>
    <div id="dlist" class="note">読み込み中…</div>
    <p class="note">${isJson?'このアプリで保存した作品ファイル（.json）が出ます。':'PNG・JPEGなどの画像が出ます。'}</p>
    <button class="btn" id="dclose">閉じる</button>`);
  document.getElementById('dclose').onclick=closeSheet;
  const run=async q=>{const box=document.getElementById('dlist');if(!box)return;box.className='note';box.textContent='読み込み中…';
    let query=isJson?"mimeType = 'application/json'":"mimeType contains 'image/'";
    if(q)query+=` and title contains '${q.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`;
    try{const fs=filesOf(await gd('search_files',{query,pageSize:50,excludeContentSnippets:true})).sort((a,b)=>String(b.modifiedTime||'').localeCompare(String(a.modifiedTime||'')));
      if(!document.getElementById('dlist'))return;
      if(!fs.length){box.textContent=q?'見つかりませんでした。':(isJson?'まだ作品ファイルがありません。「保存」→ Googleドライブで保存するとここに出ます。':'画像が見つかりませんでした。');return;}
      box.className='list';box.innerHTML=fs.map((f,i)=>`<div class="item"><button class="t" id="df${i}"><b>${esc(f.title||'(名前なし)')}</b><span>${f.modifiedTime?new Date(f.modifiedTime).toLocaleString('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):''} ${kb(f.fileSize)}</span></button></div>`).join('');
      fs.forEach((f,i)=>document.getElementById('df'+i).onclick=async()=>{const row=document.getElementById('df'+i);row.querySelector('span').textContent='読み込み中…';
        try{const u=await downloadBytes(f.id);
          if(isJson){loadProject(JSON.parse(new TextDecoder().decode(u)));S.dirty=false;updateStatus();scheduleLocal();closeSheet();toast(`「${S.name}」を開きました`);}
          else{setRefFromBlob(new Blob([u],{type:f.mimeType||'image/png'}));closeSheet();}
        }catch(e){row.querySelector('span').textContent=e instanceof SyntaxError?'作品ファイルではないようです':driveErr(e);}});
    }catch(e){box.textContent=driveErr(e);}};
  document.getElementById('dqBtn').onclick=()=>run(document.getElementById('dq').value.trim());
  document.getElementById('dq').onkeydown=e=>{if(e.key==='Enter')run(e.target.value.trim());};
  run('');}
document.getElementById('refDrive').onclick=()=>showDrivePicker('image');
function showSave(){
  const drv=mcpState==='ok';
  openSheet(`<h2>保存</h2>
   <div class="list">
    <div class="item"><div class="t static"><b>クラウド</b><span>このアプリ専用。同じ作品は上書きされます</span></div><button class="btn primary" id="sCloud">保存</button></div>
    <div class="item"><div class="t static"><b>Googleドライブ</b><span>作品ファイル（.json）を新しく追加します</span></div><button class="btn" id="sDrive"${drv?'':' disabled'}>保存</button></div>
    <div class="item"><div class="t static"><b>この端末</b><span>作品ファイル（.json）をダウンロードします</span></div><button class="btn" id="sLocal">保存</button></div>
   </div>
   <div class="drv-row"><label for="folderSel">Googleドライブの保存先</label><select id="folderSel"></select></div>
   ${drv?'':`<p class="note">${driveErr({code:mcpState==='wait'?'wait':'none'})}</p>`}
   <button class="btn" id="sClose">閉じる</button>`);
  fillFolders(document.getElementById('folderSel'));
  document.getElementById('sClose').onclick=closeSheet;
  document.getElementById('sCloud').onclick=e=>saveCloud(e.currentTarget);
  document.getElementById('sLocal').onclick=()=>offerFile(safeName()+'.json',JSON.stringify(toJSON()));
  document.getElementById('sDrive').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='保存中…';
    try{const parent=await resolveParent(document.getElementById('folderSel'));await createInDrive({title:safeName()+'.json',mime:'application/json',text:JSON.stringify(toJSON()),parentId:parent});toast('ドライブに作品ファイルを保存しました');}
    catch(er){toast(driveErr(er));}finally{b.disabled=false;b.textContent='保存';}};
}

// ---------- body templates (素体) ----------
const TPL_PAL=['#E2B48C','#DCD6CB','#4B4F5C','#6B4423','#1E1A18','#F4F1EC','#C4465A'];
// box: [x0,x1,y0,y1,z0,z1,color(1-based),part,mirror]  x/z measured from the grid centre line
const TPL={
 '標準':{note:'身長 約1.8m',boxes:[
  [2,9,4,17,-4,4,3,8,1],[2,9,0,4,-4,5,4,8,1],[1,9,17,32,-4,4,3,7,1],[-9,9,30,37,-5,5,3,1,0],
  [-9,9,37,55,-5,5,2,0,0],[-3,3,55,57,-3,3,1,0,0],[-7,7,57,71,-7,7,1,2,0],[2,4,63,65,6,7,5,2,1],
  [9,14,49,55,-3,3,2,3,1],[9,14,43,49,-3,3,1,3,1],[9,14,32,43,-3,3,1,4,1],[9,14,28,32,-3,3,1,4,1]]},
 'ぽっちゃり':{note:'身長 約1.75m',boxes:[
  [2,11,4,15,-5,5,3,8,1],[2,11,0,4,-5,6,4,8,1],[1,12,15,29,-6,6,3,7,1],[-12,12,27,35,-7,7,3,1,0],
  [-12,12,35,53,-7,7,2,0,0],[-9,9,31,48,7,10,2,0,0],[-3,3,53,55,-3,3,1,0,0],[-8,8,55,70,-7,8,1,2,0],[2,4,61,63,7,8,5,2,1],
  [12,18,47,53,-4,4,2,3,1],[12,18,41,47,-4,4,1,3,1],[12,18,30,41,-4,4,1,4,1],[12,18,26,30,-4,4,1,4,1]]},
 'ちびキャラ':{note:'身長 約1.3m',boxes:[
  [1,8,3,7,-4,4,3,8,1],[1,8,0,3,-4,5,4,8,1],[1,8,7,13,-4,4,3,7,1],[-8,8,12,17,-5,5,3,1,0],
  [-8,8,17,30,-5,5,2,0,0],[-12,12,30,52,-11,11,1,2,0],[3,6,38,42,10,11,5,2,1],[4,5,40,41,10,11,6,2,1],
  [8,12,24,30,-3,3,2,3,1],[8,12,16,24,-3,3,1,4,1]]},
};
function makeTemplate(name){
  const W=64,H=96,D=64,C=32,m=new Map();
  for(const [x0,x1,y0,y1,z0,z1,c,p,mir] of TPL[name].boxes){
    const put=(a0,a1,pp)=>{for(let x=a0;x<a1;x++)for(let y=y0;y<y1;y++)for(let z=C+z0;z<C+z1;z++)m.set(K(x,y,z),c|(pp<<8));};
    put(C+x0,C+x1,p);if(mir)put(C-x1,C-x0,MIRROR_PART[p]);}
  const u=new Uint8Array(m.size*5);let i=0;for(const [k,v] of m){u[i++]=KX(k);u[i++]=KY(k);u[i++]=KZ(k);u[i++]=v&255;u[i++]=v>>8;}
  return{name:`素体（${name}）`,w:W,h:H,d:D,unit:2.5,palette:TPL_PAL,vox:b64enc(u)};}

// ---------- GLB export ----------
const BONES=[['Root',null],['Hips','Root'],['Spine','Hips'],['Head','Spine'],['UpperArm.L','Spine'],['LowerArm.L','UpperArm.L'],['UpperArm.R','Spine'],['LowerArm.R','UpperArm.R'],['UpperLeg.L','Hips'],['LowerLeg.L','UpperLeg.L'],['UpperLeg.R','Hips'],['LowerLeg.R','UpperLeg.R']];
const REST={'UpperArm.L':[0,0,6],'UpperArm.R':[0,0,-6]};
const X=(...v)=>v.map(a=>[a,0,0]);const rep=(v,n)=>Array.from({length:n},()=>v);
const CLIPS={
 Idle:{t:[0,1,2],k:{T:[[0,0,0],[0,-.25,0],[0,0,0]],Spine:X(0,2,0),Head:X(0,-2,0),'UpperArm.L':[[0,0,0],[0,0,3],[0,0,0]],'UpperArm.R':[[0,0,0],[0,0,-3],[0,0,0]]}},
 Walk:{t:[0,.25,.5,.75,1],k:{T:[[0,0,0],[0,.4,0],[0,0,0],[0,.4,0],[0,0,0]],Spine:[[0,3,0],[0,0,0],[0,-3,0],[0,0,0],[0,3,0]],
  'UpperLeg.L':X(-30,0,30,0,-30),'UpperLeg.R':X(30,0,-30,0,30),'LowerLeg.L':X(5,5,15,35,5),'LowerLeg.R':X(15,35,5,5,15),
  'UpperArm.L':X(25,0,-25,0,25),'UpperArm.R':X(-25,0,25,0,-25),'LowerArm.L':X(-10,-10,-10,-10,-10),'LowerArm.R':X(-10,-10,-10,-10,-10)}},
 Run:{t:[0,.15,.3,.45,.6],k:{T:[[0,-.5,0],[0,.6,0],[0,-.5,0],[0,.6,0],[0,-.5,0]],Spine:X(15,15,15,15,15),Head:X(-10,-10,-10,-10,-10),
  'UpperLeg.L':X(-50,0,45,0,-50),'UpperLeg.R':X(45,0,-50,0,45),'LowerLeg.L':X(10,20,30,70,10),'LowerLeg.R':X(30,70,10,20,30),
  'UpperArm.L':X(50,0,-50,0,50),'UpperArm.R':X(-50,0,50,0,-50),'LowerArm.L':X(-70,-70,-70,-70,-70),'LowerArm.R':X(-70,-70,-70,-70,-70)}},
 Attack:{t:[0,.25,.4,.55,.8],k:{T:[[0,0,0],[0,-.5,-.3],[0,-1,1],[0,-1,1],[0,0,0]],Spine:[[0,0,0],[-5,-25,0],[12,25,0],[12,20,0],[0,0,0]],
  'UpperArm.R':X(0,40,-95,-95,0),'LowerArm.R':X(0,-90,-5,-5,0),'UpperArm.L':X(0,-20,20,15,0),'LowerArm.L':X(0,-60,-40,-40,0),
  'UpperLeg.L':X(0,-20,-25,-25,0),'UpperLeg.R':X(0,10,20,20,0),'LowerLeg.L':X(0,10,15,15,0)}},
 Sit:{t:[0,1,2],abs:'sit',k:{Spine:X(-5,-2,-5),Head:X(3,0,3),'UpperLeg.L':rep([-86,0,4],3),'UpperLeg.R':rep([-86,0,-4],3),
  'UpperArm.L':rep([-15,0,2],3),'UpperArm.R':rep([-15,0,-2],3),'LowerArm.L':X(-35,-35,-35),'LowerArm.R':X(-35,-35,-35)}},
 Sleep:{t:[0,1.5,3],abs:'sleep',k:{Hips:X(-90,-90,-90),Spine:X(0,-3,0),Head:X(0,2,0),'UpperArm.L':rep([0,0,-2],3),'UpperArm.R':rep([0,0,2],3),'UpperLeg.L':rep([0,0,5],3),'UpperLeg.R':rep([0,0,-5],3)}},
};
function quat(rx,ry,rz){
  const q=(ax,a)=>{a=a*Math.PI/360;const v=[0,0,0];v[ax]=Math.sin(a);return[...v,Math.cos(a)];};
  const mul=(a,b)=>{const[ax,ay,az,aw]=a,[bx,by,bz,bw]=b;return[aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz];};
  return mul(q(1,ry),mul(q(0,rx),q(2,rz)));
}
function greedy(cells,bb){
  // cells: Map key->color index ; returns quads [{p:[4][3], n:[3], c}]
  const [x0,y0,z0]=bb.min,[x1,y1,z1]=bb.max;const dims=[x1-x0+1,y1-y0+1,z1-z0+1];
  const at=(x,y,z)=>{if(x<0||y<0||z<0||x>=dims[0]||y>=dims[1]||z>=dims[2])return 0;return cells.get(K(x+x0,y+y0,z+z0))||0;};
  const quads=[];
  for(let a=0;a<3;a++){const u=(a+1)%3,v=(a+2)%3;
    for(const sg of [1,-1]){
      const mask=new Int32Array(dims[u]*dims[v]);
      for(let s=0;s<dims[a];s++){
        mask.fill(0);
        for(let j=0;j<dims[v];j++)for(let i=0;i<dims[u];i++){
          const c=[0,0,0];c[a]=s;c[u]=i;c[v]=j;const col=at(c[0],c[1],c[2]);if(!col)continue;
          const n=[c[0],c[1],c[2]];n[a]+=sg;if(at(n[0],n[1],n[2]))continue;mask[i+j*dims[u]]=col;}
        for(let j=0;j<dims[v];j++)for(let i=0;i<dims[u];){
          const col=mask[i+j*dims[u]];if(!col){i++;continue;}
          let wdt=1;while(i+wdt<dims[u]&&mask[i+wdt+j*dims[u]]===col)wdt++;
          let hgt=1;outer:while(j+hgt<dims[v]){for(let q=0;q<wdt;q++)if(mask[i+q+(j+hgt)*dims[u]]!==col)break outer;hgt++;}
          for(let jj=0;jj<hgt;jj++)for(let q=0;q<wdt;q++)mask[i+q+(j+jj)*dims[u]]=0;
          const plane=s+(sg>0?1:0);const mk=(uu,vv)=>{const p=[0,0,0];p[a]=plane+[x0,y0,z0][a];p[u]=uu+[x0,y0,z0][u];p[v]=vv+[x0,y0,z0][v];return p;};
          let ps=[mk(i,j),mk(i+wdt,j),mk(i+wdt,j+hgt),mk(i,j+hgt)];
          const nrm=[0,0,0];nrm[a]=sg;
          const e1=ps[1].map((t,k)=>t-ps[0][k]),e2=ps[3].map((t,k)=>t-ps[0][k]);
          const cr=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
          if(cr[0]*nrm[0]+cr[1]*nrm[1]+cr[2]*nrm[2]<0)ps=[ps[0],ps[3],ps[2],ps[1]];
          quads.push({p:ps,n:nrm,c:col});i+=wdt;
        }
      }
    }}
  return quads;
}
function buildGLB(opt={}){const useGrain=opt.grain!==false&&S.grain>0;
  const U=S.unit/100;
  const byPart=PARTS.map(()=>new Map());const bb=PARTS.map(()=>null);
  for(const [k,v] of S.vox){const p=v>>8,x=KX(k),y=KY(k),z=KZ(k);byPart[p].set(k,(v&255)|((useGrain?grainLevel(x,y,z)+2:2)<<8));
    const b=bb[p]||(bb[p]={min:[x,y,z],max:[x,y,z]});b.min=[Math.min(b.min[0],x),Math.min(b.min[1],y),Math.min(b.min[2],z)];b.max=[Math.max(b.max[0],x),Math.max(b.max[1],y),Math.max(b.max[2],z)];}
  const ctr=b=>[(b.min[0]+b.max[0]+1)/2,(b.min[1]+b.max[1]+1)/2,(b.min[2]+b.max[2]+1)/2];
  const top=b=>{const c=ctr(b);c[1]=b.max[1]+1;return c;};const bot=b=>{const c=ctr(b);c[1]=b.min[1];return c;};
  const pv={Root:[S.w/2,0,S.d/2]};
  pv.Spine=bb[0]?bot(bb[0]):[S.w/2,S.h*.45,S.d/2];
  const legTops=[7,9].filter(i=>bb[i]).map(i=>bb[i].max[1]+1);
  const hc=bb[1]?ctr(bb[1]):pv.Spine;
  pv.Hips=[hc[0],legTops.length?Math.max(...legTops):(bb[1]?bb[1].min[1]:pv.Spine[1]),hc[2]];
  pv.Head=bb[2]?bot(bb[2]):[...pv.Spine];
  for(const [up,lo,iu,il,par] of [['UpperArm.L','LowerArm.L',3,4,'Spine'],['UpperArm.R','LowerArm.R',5,6,'Spine'],['UpperLeg.L','LowerLeg.L',7,8,'Hips'],['UpperLeg.R','LowerLeg.R',9,10,'Hips']]){
    pv[up]=bb[iu]?top(bb[iu]):[...pv[par]];pv[lo]=bb[il]?top(bb[il]):(bb[iu]?bot(bb[iu]):[...pv[up]]);}
  const toM=(p,o)=>[(p[0]-o[0])*U,(p[1]-o[1])*U,(p[2]-o[2])*U];
  // binary
  const parts=[];let len=0;const views=[],accs=[];
  const add=(arr,comp,type,target,mm)=>{while(len%4){parts.push(new Uint8Array(1));len++;}
    const bytes=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);parts.push(bytes.slice());
    const v={buffer:0,byteOffset:len,byteLength:bytes.length};if(target)v.target=target;views.push(v);len+=bytes.length;
    const nc={SCALAR:1,VEC3:3,VEC4:4}[type];const a={bufferView:views.length-1,componentType:comp,count:arr.length/nc,type};
    if(mm){const mn=Array(nc).fill(Infinity),mx=Array(nc).fill(-Infinity);for(let i=0;i<arr.length;i++){const c=i%nc;mn[c]=Math.min(mn[c],arr[i]);mx[c]=Math.max(mx[c],arr[i]);}a.min=mn;a.max=mx;}
    accs.push(a);return accs.length-1;};
  const names=BONES.map(b=>b[0]);const nodes=[],meshes=[];let tris=0;
  const lin=S.palette.map(h=>{const c=new THREE.Color(h);return[c.r,c.g,c.b,1];});
  const materials=[],matIdx=new Map();
  const matFor=ci=>{const t=S.mats[ci-1]||0,key=MATS[t].glow?'g'+ci:'t'+t;if(matIdx.has(key))return matIdx.get(key);
    const M=MATS[t];const mat={name:M.glow?`光る${ci}`:M.n,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:M.m,roughnessFactor:M.r}};
    if(M.glow)mat.emissiveFactor=(lin[ci-1]||[1,1,1]).slice(0,3);materials.push(mat);matIdx.set(key,materials.length-1);return materials.length-1;};
  BONES.forEach(([n,par])=>{
    const node={name:n,translation:toM(pv[n],par?pv[par]:[0,0,0])};
    if(n==='Root')node.translation=[0,0,0];
    const pi=PARTS.findIndex(p=>p.b===n);
    if(pi>=0&&bb[pi]){
      const all=greedy(byPart[pi],bb[pi]);const o=pv[n];const groups=new Map();
      for(const q of all){const mi=matFor(q.c&255);if(!groups.has(mi))groups.set(mi,[]);groups.get(mi).push(q);}
      const prims=[];
      for(const [mi,quads] of groups){
        const P=new Float32Array(quads.length*12),N=new Float32Array(quads.length*12),C=new Float32Array(quads.length*16);
        const nv=quads.length*4;const I=nv>65535?new Uint32Array(quads.length*6):new Uint16Array(quads.length*6);
        quads.forEach((q,qi)=>{const base=lin[(q.c&255)-1]||[1,0,1,1],f=grainF((q.c>>8)-2);const col=[Math.min(1,base[0]*f),Math.min(1,base[1]*f),Math.min(1,base[2]*f),1];
          q.p.forEach((p,j)=>{const m=toM(p,o);P.set(m,(qi*4+j)*3);N.set(q.n,(qi*4+j)*3);C.set(col,(qi*4+j)*4);});
          I.set([qi*4,qi*4+1,qi*4+2,qi*4,qi*4+2,qi*4+3],qi*6);});
        tris+=quads.length*2;
        const pa=add(P,5126,'VEC3',34962,true),na=add(N,5126,'VEC3',34962),ca=add(C,5126,'VEC4',34962),ia=add(I,nv>65535?5125:5123,'SCALAR',34963);
        prims.push({attributes:{POSITION:pa,NORMAL:na,COLOR_0:ca},indices:ia,material:mi});}
      meshes.push({name:n+'_mesh',primitives:prims});node.mesh=meshes.length-1;
    }
    nodes.push(node);});
  nodes[0].translation=[0,0,0];
  names.forEach((n,i)=>{const ch=BONES.map((b,j)=>b[1]===n?j:-1).filter(j=>j>=0);if(ch.length)nodes[i].children=ch;});
  // animation numbers
  const hipsBase=nodes[1].translation;const s=Math.max(.2,hipsBase[1]/0.7);
  let sitY=0;for(const i of [7,8,9,10])if(bb[i])sitY=Math.max(sitY,(pv.Hips[2]-bb[i].min[2])*U);if(!sitY)sitY=hipsBase[1]*.3;
  let slY=0;bb.forEach(b=>{if(b)slY=Math.max(slY,(pv.Hips[2]-b.min[2])*U);});if(!slY)slY=hipsBase[1]*.3;
  const animations=[];
  for(const [cn,cl] of Object.entries(CLIPS)){
    const ta=add(new Float32Array(cl.t),5126,'SCALAR',null,true);const samplers=[],channels=[];
    names.slice(1).forEach(n=>{const r=REST[n]||[0,0,0];const vals=cl.k[n]||rep([0,0,0],cl.t.length);
      const q=new Float32Array(vals.flatMap(v=>quat(r[0]+v[0],r[1]+v[1],r[2]+v[2])));
      samplers.push({input:ta,output:add(q,5126,'VEC4'),interpolation:'LINEAR'});channels.push({sampler:samplers.length-1,target:{node:names.indexOf(n),path:'rotation'}});});
    let tr;
    if(cl.abs){const y=cl.abs==='sit'?sitY:slY;tr=cl.t.map(()=>[hipsBase[0],y,hipsBase[2]]);}
    else{const tv=cl.k.T||rep([0,0,0],cl.t.length);tr=tv.map(v=>[hipsBase[0]+v[0]*.05*s,hipsBase[1]+v[1]*.05*s,hipsBase[2]+v[2]*.05*s]);}
    samplers.push({input:ta,output:add(new Float32Array(tr.flat()),5126,'VEC3'),interpolation:'LINEAR'});
    channels.push({sampler:samplers.length-1,target:{node:1,path:'translation'}});
    animations.push({name:cn,samplers,channels});
  }
  while(len%4){parts.push(new Uint8Array(1));len++;}
  const gltf={asset:{version:'2.0',generator:'Voxel Studio'},scene:0,scenes:[{name:S.name||'character',nodes:[0]}],nodes,meshes,
    materials,
    accessors:accs,bufferViews:views,buffers:[{byteLength:len}],animations};
  let js=new TextEncoder().encode(JSON.stringify(gltf));const pad=(4-js.length%4)%4;
  if(pad){const t=new Uint8Array(js.length+pad);t.set(js);t.fill(32,js.length);js=t;}
  const total=12+8+js.length+8+len;const out=new Uint8Array(total);const dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546C67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);
  dv.setUint32(12,js.length,true);dv.setUint32(16,0x4E4F534A,true);out.set(js,20);
  let off=20+js.length;dv.setUint32(off,len,true);dv.setUint32(off+4,0x004E4942,true);off+=8;
  for(const p of parts){out.set(p,off);off+=p.length;}
  let my=0;for(const k of S.vox.keys()){const y=KY(k);if(y>my)my=y;}const height=(my+1)*U;
  return{buf:out,tris,height};
}
// zip (stored)
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
function zip(files){
  const enc=new TextEncoder();const chunks=[],central=[];let off=0;
  const d=new Date();const dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  for(const f of files){const nm=enc.encode(f.name),crc=crc32(f.data);
    const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,dt,true);h.setUint16(12,dd,true);h.setUint32(14,crc,true);h.setUint32(18,f.data.length,true);h.setUint32(22,f.data.length,true);h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
    chunks.push(new Uint8Array(h.buffer),nm,f.data);
    const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,dt,true);c.setUint16(14,dd,true);c.setUint32(16,crc,true);c.setUint32(20,f.data.length,true);c.setUint32(24,f.data.length,true);c.setUint16(28,nm.length,true);c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer),nm);off+=30+nm.length+f.data.length;}
  const cs=central.reduce((a,b)=>a+b.length,0);const e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
  return new Blob([...chunks,...central,new Uint8Array(e.buffer)],{type:'application/zip'});
}
let pvState=null;
function closePreview(){if(!pvState)return;pvState.stop=true;pvState.renderer.setAnimationLoop(null);pvState.renderer.dispose();pvState=null;}
let exportGrain=true;
document.getElementById('exportBtn').onclick=()=>openExport();
function openExport(){
  closePreview();
  if(!S.vox.size)return toast('まだブロックがありません');
  let res;try{res=buildGLB({grain:exportGrain});}catch(e){return toast('書き出しに失敗しました：'+e.message);}
  const kbs=(res.buf.length/1024).toFixed(0);
  const empty=PARTS.filter((p,i)=>![...S.vox.values()].some(v=>(v>>8)===i)).map(p=>p.n);
  openSheet(`<h2>書き出し：${esc(S.name||'character')}.glb</h2>
   <div id="pv"></div>
   <div class="clips" id="clips">${['Idle','Walk','Run','Attack','Sit','Sleep'].map((c,i)=>`<button class="btn" id="cl${i}" data-c="${c}" aria-pressed="${c==='Idle'}">${['待機','歩く','走る','攻撃','座る','寝る'][i]}</button>`).join('')}</div>
   <p class="facts">${res.tris.toLocaleString()} 三角形 ・ ${kbs}KB ・ 高さ ${res.height.toFixed(2)}m ・ 骨12本 ・ アニメ6種</p>
   ${S.grain>0?`<label class="row" style="font-size:.82rem"><input type="checkbox" id="exGrain"${exportGrain?' checked':''}> ムラ（素材感）も書き出す <span class="facts">オンにすると面がまとめられず三角形が増えます</span></label>`:''}
   ${empty.length?`<p class="note">パーツが割り当てられていない部位：${empty.join('、')}。その部位の骨は動きますが、見た目は付きません。</p>`:''}
   <p class="note">ドライブには .glb のまま保存されます。端末に保存する場合は、.glb を入れたzipになります。</p>
   <div class="drv-row"><label for="folderSel">Googleドライブの保存先</label><select id="folderSel"></select></div>
   <div class="row"><button class="btn primary" id="saveDriveGlb">ドライブに .glb を保存</button><button class="btn" id="saveZip">端末にzipで保存</button><button class="btn" id="closeE">閉じる</button></div>`);
  fillFolders(document.getElementById('folderSel'));
  document.getElementById('saveDriveGlb').onclick=async e=>{const b=e.currentTarget;const l=b.textContent;b.disabled=true;b.textContent='保存中…';
    try{const parent=await resolveParent(document.getElementById('folderSel'));await createInDrive({title:safeName()+'.glb',mime:'model/gltf-binary',bytes:res.buf,parentId:parent});toast('ドライブに .glb を保存しました');}
    catch(er){toast(driveErr(er));}finally{b.disabled=false;b.textContent=l;}};
  onSheetClose=closePreview;
  document.getElementById('closeE').onclick=closeSheet;
  const gx=document.getElementById('exGrain');if(gx)gx.onchange=()=>{exportGrain=gx.checked;onSheetClose=null;openExport();};
  document.getElementById('saveZip').onclick=()=>offerFile(safeName()+'.zip',zip([{name:safeName()+'.glb',data:res.buf}]));
  const host=document.getElementById('pv');const r2=new THREE.WebGLRenderer({antialias:true,alpha:true});r2.setPixelRatio(Math.min(devicePixelRatio,2));r2.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(r2.domElement);
  const sc=new THREE.Scene();try{sc.environment=new THREE.PMREMGenerator(r2).fromScene(new RoomEnvironment(),0.04).texture;}catch(e){}
  sc.add(new THREE.HemisphereLight(0xfff4e6,0x5a4a3a,.8));const dl=new THREE.DirectionalLight(0xffffff,1.6);dl.position.set(2,4,3);sc.add(dl);
  const c2=new THREE.PerspectiveCamera(35,1,.05,100);const H=Math.max(res.height,.3);c2.position.set(H*1.1,H*.85,H*1.9);
  const oc=new OrbitControls(c2,r2.domElement);oc.target.set(0,H*.45,0);oc.enableDamping=true;oc.update();
  const g=new THREE.Mesh(new THREE.CircleGeometry(H*.7,40),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.08}));g.rotation.x=-Math.PI/2;sc.add(g);
  const rs=()=>{const b=host.getBoundingClientRect();r2.setSize(b.width,b.height,false);c2.aspect=b.width/b.height;c2.updateProjectionMatrix();};rs();
  pvState={renderer:r2};let mixer,acts={},cur;const clock=new THREE.Clock();
  new GLTFLoader().parse(res.buf.buffer.slice(0),'',gl=>{if(!pvState)return;sc.add(gl.scene);mixer=new THREE.AnimationMixer(gl.scene);
    gl.animations.forEach(a=>{const ac=mixer.clipAction(a);if(a.name==='Attack'){ac.setLoop(THREE.LoopOnce);}acts[a.name]=ac;});
    mixer.addEventListener('finished',()=>play('Idle'));play('Idle');},e=>toast('プレビューを表示できませんでした'));
  function play(n){const nx=acts[n];if(!nx)return;nx.reset().play();if(cur&&cur!==nx)nx.crossFadeFrom(cur,.25,false);cur=nx;
    document.querySelectorAll('#clips button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.c===n)));}
  document.getElementById('clips').onclick=e=>{const b=e.target.closest('button');if(b)play(b.dataset.c);};
  r2.setAnimationLoop(()=>{const dt=clock.getDelta();if(mixer)mixer.update(dt);oc.update();r2.render(sc,c2);});
}

// ---------- start ----------
renderer.setAnimationLoop(()=>{ctl.update();renderer.render(scene,cam);});
let started=false;
try{const saved=JSON.parse(localStorage.getItem(LS)||'null');if(saved&&saved.vox!==undefined){loadProject(saved,{pid:saved.pid||null,cloudChunks:saved.cloudChunks||0});S.dirty=!!saved.dirty;updateStatus();started=true;}}catch(e){}
if(!started)loadProject(SAMPLE);
resize();frame();
window.__vs={S,buildGLB,zip,crc32,handleHit,pick,undo,redo,setTool:t=>document.querySelector(`[data-tool="${t}"]`).click(),setMode:m=>document.querySelector(`[data-mode="${m}"]`).click()};
