import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {validateSnapshot,validateIcon} from '../site/src/api.js';

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const hash=value=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const safeEqual=(a,b)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
const validDay=day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
async function body(request,max=100000){const content=await request.text();if(content.length>max)throw Error('Invalid request size');return JSON.parse(content);}
function dateQuery(url){const from=url.searchParams.get('from'),to=url.searchParams.get('to');if((from&&!validDay(from))||(to&&!validDay(to))||(from&&to&&from>to))throw Error('Invalid date range');return {...(from?{$gte:from}:{}),...(to?{$lte:to}:{})};}
const csvCell=value=>'"'+String(value??'').replace(/^[\s]*[=+\-@]/,"'$&").replaceAll('"','""')+'"';

export async function initializeMongo(db){
 await Promise.all([
  db.collection('devices').createIndex({writerHash:1},{unique:true}),
  db.collection('devices').createIndex({viewerHash:1},{unique:true}),
  db.collection('days').createIndex({deviceId:1,day:-1},{unique:true}),
  db.collection('days').createIndex({deviceId:1,'snapshot.apps.packageName':1,day:-1}),
  db.collection('sessions').createIndex({deviceId:1,day:1,start:-1,_id:-1}),
  db.collection('app_icons').createIndex({deviceId:1,packageName:1},{unique:true}),
  db.collection('pairings').createIndex({expiresAt:1},{expireAfterSeconds:0}),
  db.collection('limits').createIndex({expiresAt:1},{expireAfterSeconds:0})
 ]);
 // History deliberately has no TTL index or date-based cleanup.
}

export function createMongoApi(db,{ownerKey}){
 const devices=db.collection('devices'),days=db.collection('days'),sessions=db.collection('sessions'),icons=db.collection('app_icons'),pairings=db.collection('pairings'),limits=db.collection('limits');
 const locks=new Map();
 async function locked(id,work){const previous=locks.get(id)||Promise.resolve();let release;const current=new Promise(resolve=>release=resolve);locks.set(id,current);await previous;try{return await work();}finally{release();if(locks.get(id)===current)locks.delete(id);}}
 async function handle(request,clientIp='local'){
  const url=new URL(request.url),path=url.pathname,method=request.method,now=Date.now(),key=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  const isOwner=!!key&&safeEqual(key,ownerKey);
  if(path==='/api/health')return json({ok:true,database:'mongodb'});
  if(path==='/api/session')return json({hosted:false,signedIn:isOwner,database:'mongodb',historyRetention:'unlimited',features:{history:true,sessions:true,export:true}});
  if(path==='/api/pairings'&&method==='POST'){
   if(!isOwner)return json({error:'Enter your owner key to connect a phone.'},401);
   const input=await body(request),code=token().slice(0,20).toUpperCase(),deviceId=randomUUID(),name=String(input.name||'My phone').trim().slice(0,60)||'My phone';
   await pairings.insertOne({_id:hash(code),deviceId,name,consumed:false,expiresAt:new Date(now+600000)});
   return json({code:code.match(/.{1,4}/g).join('-'),expiresAt:now+600000,deviceId},201);
  }
  if(path==='/api/pairings/redeem'&&method==='POST'){
   const bucket=hash(clientIp)+':'+Math.floor(now/600000);
   const attempt=await limits.findOneAndUpdate({_id:bucket},{$inc:{count:1},$setOnInsert:{expiresAt:new Date(now+600000)}},{upsert:true,returnDocument:'after'});
   if(attempt.count>30)return json({error:'Too many attempts. Try again in ten minutes.'},429);
   const input=await body(request),code=String(input.code||'').replace(/[-\s]/g,'').toUpperCase();
   const pair=await pairings.findOneAndUpdate({_id:hash(code),consumed:false,expiresAt:{$gt:new Date(now)}},{$set:{consumed:true}},{returnDocument:'before'});
   if(!pair)return json({error:'Pairing code expired or already used. Create a new one.'},400);
   const writerToken=token(),viewerToken=token();
   await devices.insertOne({_id:pair.deviceId,name:pair.name,writerHash:hash(writerToken),viewerHash:hash(viewerToken),updatedAt:0,paused:false,snapshot:null,iconVersion:0,activeSessionId:null,createdAt:now});
   return json({deviceId:pair.deviceId,name:pair.name,writerToken,viewerToken},201);
  }
  if(path==='/api/devices'&&method==='GET'){
   if(!isOwner)return json({error:'Owner authentication required'},401);
   const results=await devices.find({deleted:{$ne:true}},{projection:{_id:1,name:1,updatedAt:1,paused:1}}).sort({updatedAt:-1}).toArray();
   return json({devices:results.map(d=>({id:d._id,name:d.name,updated:d.updatedAt,paused:d.paused}))});
  }
  const match=path.match(/^\/api\/devices\/([a-f0-9-]+)(\/(?:snapshot|viewer|sharing|icons|history(?:\/[0-9-]+)?|sessions|export))?$/);
  if(!match)return json({error:'Not found'},404);
  const id=match[1],action=match[2]||'';
  const device=await devices.findOne({_id:id});
  if(!device||(device.deleted&&!(method==='DELETE'&&!action)))return json({error:'Device not found'},404);
  const digest=hash(key),writer=!!key&&digest===device.writerHash,viewer=!!key&&digest===device.viewerHash,canRead=isOwner||writer||viewer;
  if(action==='/snapshot'&&method==='POST'){
   if(!writer)return json({error:'Phone authentication required'},401);
   if(device.paused)return json({ok:true,paused:true});
   const snapshot=validateSnapshot(await body(request));if(!validDay(snapshot.day))throw Error('Invalid capture date');
   if(device.snapshot&&device.snapshot.capturedAt>snapshot.capturedAt)return json({error:'Outdated snapshot'},409);
   const updated=await devices.updateOne({_id:id,deleted:{$ne:true},paused:false},{$set:{snapshot,updatedAt:now,paused:snapshot.paused}});
   if(!updated.matchedCount)return json({ok:true,paused:true});
   await days.updateOne({_id:id+':'+snapshot.day},{$set:{deviceId:id,day:snapshot.day,snapshot}},{upsert:true});
   const active=snapshot.screenOn&&snapshot.currentApp&&!snapshot.paused;
   const old=device.snapshot,continuous=active&&device.activeSessionId&&old?.screenOn&&old.currentApp?.packageName===snapshot.currentApp.packageName&&old.day===snapshot.day&&snapshot.capturedAt-old.capturedAt<=30000;
   let sessionId=null;
   if(continuous){sessionId=device.activeSessionId;await sessions.updateOne({_id:sessionId,deviceId:id},{$set:{end:snapshot.capturedAt}});}
   else if(active){sessionId=randomUUID();await sessions.insertOne({_id:sessionId,deviceId:id,day:snapshot.day,start:snapshot.capturedAt,end:snapshot.capturedAt,app:snapshot.currentApp,timezone:snapshot.timezone});}
   await devices.updateOne({_id:id,deleted:{$ne:true}},{$set:{activeSessionId:sessionId}});
   return json({ok:true,paused:snapshot.paused});
  }
  if(action==='/icons'&&method==='POST'){
   if(!writer)return json({error:'Phone authentication required'},401);
   if(device.paused)return json({error:'Sharing is paused'},409);
   const input=await body(request,500000);if(!input.icons||typeof input.icons!=='object'||Array.isArray(input.icons))throw Error('Invalid app icons');
   const entries=Object.entries(input.icons);if(entries.length<1||entries.length>20)throw Error('Invalid app icon batch');
   const packages=new Set(await icons.distinct('packageName',{deviceId:id}));
   const writes=entries.map(([packageName,data])=>{if(!/^[A-Za-z0-9_.]{1,200}$/.test(packageName))throw Error('Invalid app package');packages.add(packageName);return {updateOne:{filter:{deviceId:id,packageName},update:{$set:{data:validateIcon(data)}},upsert:true}};});
   if(packages.size>300)throw Error('Invalid app icon count');
   await icons.bulkWrite(writes);await devices.updateOne({_id:id},{$inc:{iconVersion:1}});return json({ok:true});
  }
  if(action==='/icons'&&method==='GET'){
   if(!canRead)return json({error:'This viewing link is invalid or has been revoked.'},401);
   if(device.paused)return json({icons:{},version:0});const rows=await icons.find({deviceId:id}).toArray();return json({icons:Object.fromEntries(rows.map(row=>[row.packageName,row.data])),version:device.iconVersion});
  }
  if(action==='/sharing'&&method==='POST'){
   if(!writer&&!isOwner)return json({error:'Owner or phone authentication required'},401);
   const input=await body(request),paused=input.paused!==false;if(!paused&&!writer)return json({error:'Resume sharing from your phone.'},403);
   await devices.updateOne({_id:id},{$set:{paused,activeSessionId:null}});return json({ok:true,paused});
  }
  if(action==='/viewer'&&method==='POST'){
   if(!isOwner&&!writer)return json({error:'Owner or phone authentication required'},401);
   const viewerToken=token();await devices.updateOne({_id:id},{$set:{viewerHash:hash(viewerToken)}});return json({viewerToken});
  }
  if(!action&&method==='DELETE'){
   if(!isOwner&&!writer)return json({error:'Owner or phone authentication required'},401);
   await devices.updateOne({_id:id},{$set:{deleted:true,paused:true}});
   await Promise.all([days.deleteMany({deviceId:id}),sessions.deleteMany({deviceId:id}),icons.deleteMany({deviceId:id})]);await devices.deleteOne({_id:id});return json({ok:true});
  }
  if(!canRead)return json({error:'This viewing link is invalid or has been revoked.'},401);
  if(action.startsWith('/history')&&method==='GET'){
   if(device.paused)return json(action==='/history'?{days:[],nextCursor:null,total:0}: {snapshot:null});
   if(action!=='/history'){
    const day=action.slice('/history/'.length);if(!validDay(day))throw Error('Invalid date');const record=await days.findOne({deviceId:id,day});return json({snapshot:record?.snapshot||null});
   }
   const range=dateQuery(url),query={deviceId:id,...(Object.keys(range).length?{day:range}:{})};
   const app=url.searchParams.get('app');if(app){if(app.length>200)throw Error('Invalid app filter');query['snapshot.apps.packageName']=app;}
   const countQuery={...query};
   const cursor=url.searchParams.get('cursor');if(cursor){let day;try{day=Buffer.from(cursor,'base64url').toString();}catch{throw Error('Invalid history cursor');}if(!validDay(day))throw Error('Invalid history cursor');query.day={...range,$lt:day};}
   const limit=Math.min(62,Math.max(1,parseInt(url.searchParams.get('limit')||'30',10)||30));
   const records=await days.find(query).sort({day:-1}).limit(limit+1).toArray(),hasMore=records.length>limit;records.length=Math.min(records.length,limit);
   const detail=url.searchParams.get('detail')==='true';
   const first=await days.findOne({deviceId:id},{sort:{day:1},projection:{day:1}});
   return json({days:records.map(record=>detail?record.snapshot:{day:record.day,screenTimeMs:record.snapshot.screenTimeMs,unlocks:record.snapshot.unlocks,appCount:record.snapshot.apps.length,topApp:app?record.snapshot.apps.find(item=>item.packageName===app)||null:record.snapshot.apps.slice().sort((a,b)=>b.durationMs-a.durationMs)[0]||null}),nextCursor:hasMore?Buffer.from(records.at(-1).day).toString('base64url'):null,firstDay:first?.day||null,total:await days.countDocuments(countQuery)});
  }
  if(action==='/sessions'&&method==='GET'){
   if(device.paused)return json({sessions:[],nextCursor:null});
   const range=dateQuery(url),query={deviceId:id,...(Object.keys(range).length?{day:range}:{})};
   const cursor=url.searchParams.get('cursor');if(cursor){let decoded;try{decoded=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch{throw Error('Invalid session cursor');}if(!Number.isFinite(decoded.start)||typeof decoded.id!=='string')throw Error('Invalid session cursor');query.$or=[{start:{$lt:decoded.start}},{start:decoded.start,_id:{$lt:decoded.id}}];}
   const limit=30,records=await sessions.find(query).sort({start:-1,_id:-1}).limit(limit+1).toArray(),hasMore=records.length>limit;records.length=Math.min(records.length,limit);const last=records.at(-1);
   return json({sessions:records.map(({_id,deviceId,...record})=>({id:_id,...record,durationMs:record.end-record.start})),nextCursor:hasMore?Buffer.from(JSON.stringify({start:last.start,id:last._id})).toString('base64url'):null});
  }
  if(action==='/export'&&method==='GET'){
   if(device.paused)return json({error:'Sharing is paused'},409);
   const range=dateQuery(url),app=url.searchParams.get('app');if(app&&app.length>200)throw Error('Invalid app filter');const cursor=days.find({deviceId:id,...(Object.keys(range).length?{day:range}:{}),...(app?{'snapshot.apps.packageName':app}:{})}).sort({day:1});
   async function* rows(){yield 'Date,Screen time minutes,Unlocks,App,Package,App minutes\r\n';for await(const row of cursor){const s=row.snapshot;for(const entry of (s.apps.length?s.apps:[{name:'',packageName:'',durationMs:0}]).filter(entry=>!app||entry.packageName===app))yield [s.day,Math.round(s.screenTimeMs/60000),s.unlocks,entry.name,entry.packageName,Math.round(entry.durationMs/60000)].map(csvCell).join(',')+'\r\n';}}
   const iterator=rows(),encoder=new TextEncoder();const stream=new ReadableStream({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value));}catch(error){controller.error(error);}},async cancel(){await iterator.return();await cursor.close();}});
   return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="closer-history.csv"','Cache-Control':'no-store'}});
  }
  if(!action&&method==='GET'){
   const recent=device.paused?[]:await days.find({deviceId:id}).sort({day:-1}).limit(7).toArray();
   return json({id,name:device.name,updatedAt:device.updatedAt,iconVersion:device.iconVersion,paused:device.paused,snapshot:device.paused?null:device.snapshot,days:recent.map(d=>d.snapshot),role:isOwner?'owner':writer?'phone':'viewer',database:'mongodb',historyRetention:'unlimited'});
  }
  return json({error:'Method not allowed'},405);
 }
 return async function mongoApi(request,ip){try{
  const id=new URL(request.url).pathname.match(/^\/api\/devices\/([a-f0-9-]+)/)?.[1];
  // Serialize each device's requests to make pause, link rotation, deletion and uploads coherent.
  return id?await locked(id,()=>handle(request,ip)):await handle(request,ip);
 }catch(error){if(error instanceof SyntaxError||/^Invalid/.test(error.message))return json({error:error.message},400);console.error('Mongo API request failed:',error.code||error.name);return json({error:'Unable to complete request. Please retry.'},500);}};
}
