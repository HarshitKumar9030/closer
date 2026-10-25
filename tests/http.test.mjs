import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {MongoClient} from 'mongodb';
test('real HTTP server strips spoofed identity and serves authenticated pairings and frontend',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'closer-http-')),key=randomBytes(32).toString('hex'),database='closer_http_'+randomBytes(8).toString('hex'),uri=process.env.TEST_MONGODB_URI||'mongodb://127.0.0.1:27028';
 const child=spawn(process.execPath,['server/local.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'0',MONGODB_URI:uri,MONGODB_DATABASE:database,OWNER_KEY:key,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
 try{const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Server startup timeout')),10000);child.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/Closer: (http:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});});
  const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/closer/);assert.match(page.headers.get('content-security-policy'),/default-src 'self'/);
  assert.equal((await fetch(base+'/readyz')).status,200);assert.equal((await fetch(base+'/healthz')).status,200);
  const forged=await fetch(base+'/api/pairings',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'fake-owner'},body:'{}'});assert.equal(forged.status,401);
  const pair=await fetch(base+'/api/pairings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({name:'HTTP test phone'})});assert.equal(pair.status,201);assert.match((await pair.json()).code,/^[A-F0-9]{4}(-[A-F0-9]{4}){4}$/);
  const invalid=await fetch(base+'/api/pairings',{method:'POST',headers:{Authorization:'Bearer '+key},body:'not-json'});assert.equal(invalid.status,400);
  const tooLarge=await fetch(base+'/api/pairings',{method:'POST',body:'x'.repeat(100001)});assert.equal(tooLarge.status,413);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));const client=new MongoClient(uri);await client.connect();await client.db(database).dropDatabase();await client.close();rmSync(dir,{recursive:true,force:true});}
});
