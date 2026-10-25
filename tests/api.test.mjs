import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {api,validateIcon} from '../site/src/api.js';
import {adapter} from '../server/database.mjs';
function setup(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../site/schema.sql',import.meta.url),'utf8'));const env={DB:adapter(sqlite),OWNER_KEY:'test-owner-only',CLIENT_IP:'127.0.0.1'};
 const call=async(path,method='GET',data,auth='')=>{const r=await api(new Request('https://example.test/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:data===undefined?undefined:JSON.stringify(data)}),env);return {status:r.status,data:await r.json()};};return {sqlite,call};}
const snapshot=()=>({day:new Date().toISOString().slice(0,10),capturedAt:Date.now(),screenTimeMs:7200000,unlocks:12,hourly:Array(24).fill(0).map((_,i)=>i===12||i===13?3600000:0),apps:[{packageName:'com.example',name:'Example',durationMs:7200000}],currentApp:{packageName:'com.example',name:'Example'},screenOn:true,paused:false,battery:70,timezone:'UTC'});
async function pair(call){const p=await call('/pairings','POST',{name:'Test phone'},'test-owner-only');assert.equal(p.status,201);const r=await call('/pairings/redeem','POST',{code:p.data.code});assert.equal(r.status,201);return {...r.data,code:p.data.code};}
test('pair, upload, read-only viewing, rotation, pause and deletion work end to end',async()=>{const {call,sqlite}=setup();const p=await pair(call),path='/devices/'+p.deviceId;
 assert.equal((await call('/pairings','POST',{})).status,401);
 assert.equal((await call('/pairings/redeem','POST',{code:p.code})).status,400);
 assert.equal((await call(path+'/snapshot','POST',snapshot(),p.viewerToken)).status,401);
 assert.equal((await call(path+'/snapshot','POST',snapshot(),p.writerToken)).status,200);
 assert.equal((await call(path)).status,401);
 const view=await call(path,'GET',undefined,p.viewerToken);assert.equal(view.data.snapshot.unlocks,12);assert.equal(view.data.role,'viewer');assert.equal(view.data.days.length,1);assert.equal('writer_hash' in view.data,false);
 assert.equal((await call(path+'/viewer','POST',{},p.viewerToken)).status,401);
 const rotated=await call(path+'/viewer','POST',{},'test-owner-only');assert.equal((await call(path,'GET',undefined,p.viewerToken)).status,401);
 assert.equal((await call(path,'GET',undefined,rotated.data.viewerToken)).status,200);
 await call(path+'/sharing','POST',{paused:true},'test-owner-only');const paused=await call(path,'GET',undefined,rotated.data.viewerToken);assert.equal(paused.data.snapshot,null);assert.deepEqual(paused.data.days,[]);
 const blocked=await call(path+'/snapshot','POST',snapshot(),p.writerToken);assert.equal(blocked.data.paused,true);
 assert.equal((await call(path+'/sharing','POST',{paused:false},'test-owner-only')).status,403);
 await call(path+'/sharing','POST',{paused:false},p.writerToken);await call(path+'/snapshot','POST',snapshot(),p.writerToken);assert.equal((await call(path,'GET',undefined,rotated.data.viewerToken)).data.paused,false);
 assert.equal((await call(path,'DELETE',undefined,rotated.data.viewerToken)).status,401);
 assert.equal((await call(path,'DELETE',undefined,p.writerToken)).status,200);assert.equal((await call(path,'GET',undefined,rotated.data.viewerToken)).status,404);assert.equal(sqlite.prepare('SELECT count(*) n FROM days').get().n,0);sqlite.close();});
test('expired codes, malformed uploads, stale updates and attempts are rejected',async()=>{const {call,sqlite}=setup();const expired=await call('/pairings','POST',{},'test-owner-only');sqlite.exec('UPDATE pairings SET expires=0');assert.equal((await call('/pairings/redeem','POST',{code:expired.data.code})).status,400);
 const p=await pair(call),path='/devices/'+p.deviceId;const bad=snapshot();bad.screenTimeMs=-1;assert.equal((await call(path+'/snapshot','POST',bad,p.writerToken)).status,400);
 const current=snapshot();current.capturedAt+=1000;await call(path+'/snapshot','POST',current,p.writerToken);assert.equal((await call(path+'/snapshot','POST',snapshot(),p.writerToken)).status,409);
 for(let i=0;i<30;i++)await call('/pairings/redeem','POST',{code:'INVALID'});assert.equal((await call('/pairings/redeem','POST',{code:'INVALID'})).status,429);sqlite.close();});
test('a pairing code can be redeemed only once under concurrent requests',async()=>{const {call,sqlite}=setup();const pair=await call('/pairings','POST',{},'test-owner-only');const results=await Promise.all([call('/pairings/redeem','POST',{code:pair.data.code}),call('/pairings/redeem','POST',{code:pair.data.code})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);assert.equal(sqlite.prepare('SELECT count(*) n FROM devices').get().n,1);sqlite.close();});

test('installed icons are private, writer-only, versioned, hidden on pause and deleted with the phone',async()=>{
 const {call,sqlite}=setup();const p=await pair(call),path='/devices/'+p.deviceId;
 const icon='data:image/png;base64,'+readFileSync(new URL('../site/src/icons/instagram.png',import.meta.url)).toString('base64');
 assert.equal((await call(path+'/icons')).status,401);
 assert.equal((await call(path+'/icons','POST',{icons:{'com.example':icon}},p.viewerToken)).status,401);
 assert.equal((await call(path+'/icons','POST',{icons:{'com.example':'data:image/svg+xml,<svg/>'}},p.writerToken)).status,400);
 assert.equal((await call(path+'/icons','POST',{icons:{'com.example':icon}},p.writerToken)).status,200);
 const result=await call(path+'/icons','GET',undefined,p.viewerToken);assert.equal(result.data.icons['com.example'],icon);assert.equal(result.data.version,1);
 assert.equal((await call(path,'GET',undefined,p.viewerToken)).data.iconVersion,1);
 await call(path+'/sharing','POST',{paused:true},'test-owner-only');assert.deepEqual((await call(path+'/icons','GET',undefined,p.viewerToken)).data.icons,{});
 assert.equal((await call(path+'/icons','POST',{icons:{'com.example':icon}},p.writerToken)).status,409);
 await call(path,'DELETE',undefined,p.writerToken);assert.equal(sqlite.prepare('SELECT count(*) n FROM app_icons').get().n,0);sqlite.close();
});
test('icon validator rejects oversized dimensions, invalid encodings and non-PNG content',()=>{
 const png=readFileSync(new URL('../site/src/icons/instagram.png',import.meta.url));const large=Buffer.from(png);large.writeUInt32BE(1000000,16);
 assert.throws(()=>validateIcon('data:image/png;base64,'+large.toString('base64')),/dimensions/);
 assert.throws(()=>validateIcon('data:image/png;base64,'+Buffer.from('<svg/>').toString('base64')),/Invalid/);
 assert.throws(()=>validateIcon('data:image/png;base64,'+'A'.repeat(40000)),/Invalid/);
});
