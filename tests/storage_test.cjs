// Checks cloud chunk save/load, deletion state, and Google Drive download decoding.
// Usage: node tests/storage_test.cjs
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','src','app.js'),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('marker missing: '+a+' / '+b);return src.slice(i,j);};

let fail=0;
const ok=(value,message)=>{console.log((value?'ok   ':'FAIL ')+message);if(!value)fail++;};

async function testCloud(){
  const code=`
  const S={name:'大きい作品',w:64,h:96,d:64,unit:2.5,palette:['#000000'],mats:[0],grain:0,vox:new Map([[1,1]]),pid:null,cloudChunks:0,dirty:true};
  let col=null,localSaves=0,loaded=null;
  function encodeVox(){return cloudData;}
  function updateStatus(){}
  function scheduleLocal(){localSaves++;}
  function toast(){}
  function loadProject(project,options){loaded={project,options};}
  function closeSheet(){}
  function showOpen(){}
  ${cut('const CH=','document.getElementById(\'saveBtn\')')}
  ${cut('async function openCloud','const PRESETS=')}
  return {S,setCol:value=>col=value,saveCloud,openCloud,deleteCloud,getLocalSaves:()=>localSaves,getLoaded:()=>loaded};`;
  const cloudData='A'.repeat(180000)+'BCDEF';
  const api=new Function('cloudData',code)(cloudData);
  const docs=new Map(),deleted=[];
  api.setCol({doc:id=>({
    set:async value=>docs.set(id,value),
    get:async()=>({exists:docs.has(id),data:()=>docs.get(id)}),
    delete:async()=>{deleted.push(id);docs.delete(id);}
  })});
  const button={textContent:'保存',disabled:false};
  await api.saveCloud(button);
  const pid=api.S.pid;
  ok(api.S.cloudChunks===2&&docs.get(`c_${pid}_0`).d.length===180000&&docs.get(`c_${pid}_1`).d==='BCDEF','大きい作品を複数チャンクに分けて保存');
  ok(docs.get('m_'+pid).chunks===2&&api.S.dirty===false,'メタデータと保存済み状態を更新');
  await api.openCloud(docs.get('m_'+pid));
  const loaded=api.getLoaded();
  ok(loaded.project.vox===cloudData&&loaded.options.cloudChunks===2,'チャンクを順番どおり再結合して読み込む');
  const before=api.getLocalSaves();
  await api.deleteCloud({pid,chunks:2});
  ok(api.S.pid===null&&api.S.cloudChunks===0&&api.S.dirty===true,'開いているクラウド作品の削除後に端末側の状態を切り離す');
  ok(api.getLocalSaves()===before+1,'削除後の状態を端末内自動保存へ反映');
  ok(deleted.includes(`c_${pid}_0`)&&deleted.includes(`c_${pid}_1`)&&deleted.includes('m_'+pid),'作品のチャンクとメタデータを削除');
}

async function testDrive(){
  const code=`
  let response=null;
  async function gd(){return response;}
  function b64dec(s){return new Uint8Array(Buffer.from(s,'base64'));}
  ${cut('function findB64','async function createInDrive')}
  return {setResponse:value=>response=value,downloadBytes};`;
  const api=new Function('Buffer',code)(Buffer);
  const expected=Buffer.from('{"app":"voxel-studio","name":"テスト"}');
  for(const [label,response] of [
    ['content',{payload:{content:expected.toString('base64')}}],
    ['base64Content',{payload:{base64Content:expected.toString('base64')}}],
    ['入れ子',{payload:{file:{result:{bytes:expected.toString('base64url')}}}}]
  ]){
    api.setResponse(response);
    const actual=Buffer.from(await api.downloadBytes('file-id'));
    ok(actual.equals(expected),`Googleドライブの${label}形式を復元`);
  }
}

(async()=>{await testCloud();await testDrive();console.log(fail?fail+' failed':'all passed');process.exit(fail?1:0);})().catch(error=>{console.error(error);process.exit(1);});
