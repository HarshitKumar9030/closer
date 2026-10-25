const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
const hash = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2,'0')).join('');
const bearer = r => r.headers.get('authorization')?.replace(/^Bearer /,'') || '';
async function body(r, maximum = 100000) { if (Number(r.headers.get('content-length')) > maximum) throw new Error('Request too large'); const text = await r.text(); if(text.length > maximum) throw new Error('Request too large'); return JSON.parse(text); }
export function validateIcon(value) {
 if (typeof value !== 'string' || value.length > 32768 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid app icon');
 let bytes;try { bytes=Uint8Array.from(atob(value.slice(22)),c=>c.charCodeAt(0)); } catch { throw new Error('Invalid app icon'); }
 const signature=[137,80,78,71,13,10,26,10];
 if(bytes.length<33||signature.some((byte,i)=>bytes[i]!==byte)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error('Invalid app icon');
 const header=new DataView(bytes.buffer);const width=header.getUint32(16),height=header.getUint32(20);
 if(width<1||height<1||width>128||height>128)throw new Error('Invalid app icon dimensions');
 return value;
}
export function validateSnapshot(s) {
  if(!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.day) || !Number.isFinite(s.capturedAt) || Math.abs(Date.now()-s.capturedAt)>300000) throw new Error('Invalid capture date or phone clock');
  if(!Number.isFinite(Date.parse(s.day))||new Date(s.day).toISOString().slice(0,10)!==s.day)throw new Error('Invalid capture date');
  const timezone=typeof s.timezone==='string'?s.timezone:'UTC';
  if(timezone.length>80)throw new Error('Invalid timezone');
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(0);}catch{throw new Error('Invalid timezone');}
  if(!Number.isInteger(s.screenTimeMs) || s.screenTimeMs<0 || s.screenTimeMs>90000000 || !Number.isInteger(s.unlocks) || s.unlocks<0 || s.unlocks>100000) throw new Error('Invalid usage totals');
  if(!Array.isArray(s.apps)||s.apps.length>300 || !Array.isArray(s.hourly)||s.hourly.length!==24 || s.hourly.some(n=>!Number.isFinite(n)||n<0||n>7200000)) throw new Error('Invalid usage breakdown');
  const cleanApp = a => {if(!a || typeof a.packageName!=='string'||a.packageName.length>200||typeof a.name!=='string'||a.name.length>100||!Number.isInteger(a.durationMs)||a.durationMs<0||a.durationMs>90000000)throw new Error('Invalid app');return {packageName:a.packageName,name:a.name,durationMs:a.durationMs};};
  return {day:s.day,capturedAt:s.capturedAt,screenTimeMs:s.screenTimeMs,unlocks:s.unlocks,hourly:s.hourly,apps:s.apps.map(cleanApp),currentApp:s.currentApp?cleanApp({...s.currentApp,durationMs:0}):null,screenOn:!!s.screenOn,paused:!!s.paused,timezone,battery:Number.isInteger(s.battery)?Math.max(0,Math.min(100,s.battery)):null};
}
export async function api(request, env) {
 const u=new URL(request.url), path=u.pathname, db=env.DB, now=Date.now();
 if(path==='/api/health')return json({ok:true});
 if(path==='/api/session')return json({hosted:!!env.HOSTED,signedIn:!!request.headers.get('oai-authenticated-user-id')});
 if(!db)return json({error:'Database is not configured'},503);
 const key=bearer(request);
 // On Sites identity headers are set by the authenticated gateway. The local adapter strips them.
 const identity=request.headers.get('oai-authenticated-user-id');
 const owner=identity ? 'sites:'+identity : env.OWNER_KEY && key && await hash(key)===await hash(env.OWNER_KEY) ? 'self-hosted-owner' : null;
 const first=(sql,...args)=>db.prepare(sql).bind(...args).first();
 const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
 try {
  if(path==='/api/pairings'&&request.method==='POST') {
   if(!owner)return json({error:'Enter your owner key to connect a phone.'},401);
   const data=await body(request), name=String(data.name||'My phone').trim().slice(0,60)||'My phone';
   const code=token().slice(0,20).toUpperCase(), id=crypto.randomUUID();
   await run('DELETE FROM pairings WHERE expires < ?',now);
   await run('INSERT INTO pairings (code_hash,device_id,owner_id,name,expires) VALUES (?,?,?,?,?)',await hash(code),id,owner,name,now+600000);
   return json({code:code.match(/.{1,4}/g).join('-'),expiresAt:now+600000,deviceId:id},201);
  }
  if(path==='/api/pairings/redeem'&&request.method==='POST') {
   const ip=request.headers.get('cf-connecting-ip')||env.CLIENT_IP||'local', bucket='pair:'+await hash(ip)+':'+Math.floor(now/600000);
   await run('DELETE FROM limits WHERE expires < ?',now);
   await run('INSERT INTO limits (bucket,count,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',bucket,now+600000);
   const attempts=await first('SELECT count FROM limits WHERE bucket=?',bucket);if(attempts.count>30)return json({error:'Too many attempts. Try again in ten minutes.'},429);
   const data=await body(request), code=String(data.code||'').replace(/[-\s]/g,'').toUpperCase();
   // Atomic claim prevents two devices redeeming the same code.
   const pair=await first('UPDATE pairings SET consumed=1 WHERE code_hash=? AND consumed=0 AND expires>? RETURNING *',await hash(code),now);
   if(!pair)return json({error:'Pairing code expired or already used. Create a new one.'},400);
   const writer=token(),viewer=token();
   await run('INSERT INTO devices (id,owner_id,name,writer_hash,viewer_hash) VALUES (?,?,?,?,?)',pair.device_id,pair.owner_id,pair.name,await hash(writer),await hash(viewer));
   return json({deviceId:pair.device_id,writerToken:writer,viewerToken:viewer,name:pair.name},201);
  }
  if(path==='/api/devices'&&request.method==='GET') {
   if(!owner)return json({error:'Owner authentication required'},401);
   const result=await db.prepare('SELECT id,name,updated,paused FROM devices WHERE owner_id=? ORDER BY updated DESC').bind(owner).all();return json({devices:result.results});
  }
  const match=path.match(/^\/api\/devices\/([a-f0-9-]+)(\/snapshot|\/viewer|\/sharing|\/icons)?$/);
  if(!match)return json({error:'Not found'},404);
  const id=match[1],action=match[2]||'',device=await first('SELECT * FROM devices WHERE id=?',id);
  if(!device)return json({error:'Device not found'},404);
  const digest=await hash(key),isWriter=!!key&&digest===device.writer_hash,isViewer=!!key&&digest===device.viewer_hash,isOwner=owner&&device.owner_id===owner;
  if(action==='/icons'&&request.method==='POST') {
   if(!isWriter)return json({error:'Phone authentication required'},401);
   if(device.paused)return json({error:'Sharing is paused'},409);
   const data=await body(request,500000);
   if(!data.icons||Array.isArray(data.icons)||typeof data.icons!=='object')throw new Error('Invalid app icons');
   const entries=Object.entries(data.icons);if(entries.length<1||entries.length>20)throw new Error('Invalid app icon batch');
   const existing=await db.prepare('SELECT package_name FROM app_icons WHERE device_id=?').bind(id).all();
   const packages=new Set(existing.results.map(row=>row.package_name));
   const writes=entries.map(([pkg,icon])=>{if(!/^[A-Za-z0-9_.]{1,200}$/.test(pkg))throw new Error('Invalid app package');packages.add(pkg);return db.prepare('INSERT INTO app_icons (device_id,package_name,data) VALUES (?,?,?) ON CONFLICT(device_id,package_name) DO UPDATE SET data=excluded.data').bind(id,pkg,validateIcon(icon));});
   if(packages.size>300)throw new Error('Invalid app icon count');
   await db.batch([...writes,db.prepare('UPDATE devices SET icon_version=icon_version+1 WHERE id=?').bind(id)]);
   return json({ok:true});
  }
  if(action==='/icons'&&request.method==='GET') {
   if(!isOwner&&!isViewer&&!isWriter)return json({error:'This viewing link is invalid or has been revoked.'},401);
   if(device.paused)return json({icons:{},version:0});
   const rows=await db.prepare('SELECT package_name,data FROM app_icons WHERE device_id=?').bind(id).all();
   return json({icons:Object.fromEntries(rows.results.map(row=>[row.package_name,row.data])),version:device.icon_version});
  }
  if(action==='/snapshot'&&request.method==='POST') {
   if(!isWriter)return json({error:'Phone authentication required'},401);
   const snapshot=validateSnapshot(await body(request));
   if(device.snapshot && JSON.parse(device.snapshot).capturedAt>snapshot.capturedAt)return json({error:'Outdated snapshot'},409);
   const encoded=JSON.stringify(snapshot);
   if(device.paused&&!snapshot.paused)return json({ok:true,paused:true});
   await db.batch([db.prepare('UPDATE devices SET snapshot=?,updated=?,paused=(paused OR ?) WHERE id=?').bind(encoded,now,snapshot.paused?1:0,id),db.prepare('INSERT INTO days (device_id,day,snapshot) VALUES (?,?,?) ON CONFLICT(device_id,day) DO UPDATE SET snapshot=excluded.snapshot').bind(id,snapshot.day,encoded)]);
   const updated=await first('SELECT paused FROM devices WHERE id=?',id);
   return json({ok:true,paused:!!updated?.paused});
  }
  if(action==='/sharing'&&request.method==='POST') {
   if(!isWriter&&!isOwner)return json({error:'Owner or phone authentication required'},401);
   const data=await body(request);const paused=data.paused!==false;
   if(!paused&&!isWriter)return json({error:'Resume sharing from your phone.'},403);
   await run('UPDATE devices SET paused=? WHERE id=?',paused?1:0,id);return json({ok:true,paused});
  }
  if(action==='/viewer'&&request.method==='POST') {
   if(!isOwner&&!isWriter)return json({error:'Owner or phone authentication required'},401);
   const viewer=token();await run('UPDATE devices SET viewer_hash=? WHERE id=?',await hash(viewer),id);return json({viewerToken:viewer});
  }
  if(!action&&request.method==='DELETE') {
   if(!isOwner&&!isWriter)return json({error:'Owner or phone authentication required'},401);
   await db.batch([db.prepare('DELETE FROM days WHERE device_id=?').bind(id),db.prepare('DELETE FROM app_icons WHERE device_id=?').bind(id),db.prepare('DELETE FROM devices WHERE id=?').bind(id)]);return json({ok:true});
  }
  if(!action&&request.method==='GET') {
   if(!isOwner&&!isViewer&&!isWriter)return json({error:'This viewing link is invalid or has been revoked.'},401);
   const rows=await db.prepare('SELECT day,snapshot FROM days WHERE device_id=? ORDER BY day DESC LIMIT 7').bind(id).all();
   // Pausing hides all activity from viewers until the phone explicitly resumes.
   return json({id,name:device.name,updatedAt:device.updated,iconVersion:device.icon_version,paused:!!device.paused,snapshot:device.paused?null:device.snapshot?JSON.parse(device.snapshot):null,days:device.paused?[]:rows.results.map(r=>JSON.parse(r.snapshot)),role:isOwner?'owner':isWriter?'phone':'viewer'});
  }
  return json({error:'Method not allowed'},405);
 } catch(e) { if(e instanceof SyntaxError || /Invalid|Request too large/.test(e.message))return json({error:e.message},400);console.error('API failure',e.message);return json({error:'Unable to complete request. Please retry.'},500); }
}
