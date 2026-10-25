import http from 'node:http';
import {Readable} from 'node:stream';
import {readFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {createMongoApi,initializeMongo} from './mongo-api.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
if(process.env.NODE_ENV==='production'&&(!process.env.OWNER_KEY||process.env.OWNER_KEY.length<32))throw Error('Set an OWNER_KEY of at least 32 characters before production startup.');
if(process.env.NODE_ENV==='production'&&!process.env.MONGODB_URI)throw Error('Set MONGODB_URI before production startup.');
const ownerKey=process.env.OWNER_KEY||randomBytes(24).toString('hex');
const client=new MongoClient(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017',{maxPoolSize:10,serverSelectionTimeoutMS:10000,waitQueueTimeoutMS:10000});
try{await client.connect();}catch{console.error('Cannot connect to MongoDB. Start MongoDB and set MONGODB_URI.');process.exit(1);}
const db=client.db(process.env.MONGODB_DATABASE||'closer');await initializeMongo(db);const api=createMongoApi(db,{ownerKey});
const assets={'/':['../site/src/index.html','text/html; charset=utf-8'],'/app.js':['../site/src/app.js','text/javascript; charset=utf-8'],'/styles.css':['../site/src/styles.css','text/css; charset=utf-8'],'/ui-icons.js':['../site/src/ui-icons.js','text/javascript; charset=utf-8']};
for(const name of ['instagram','whatsapp','youtube','chrome'])assets['/icons/'+name+'.png']=['../site/src/icons/'+name+'.png','image/png'];
assets['/icons/spotify.jpg']=['../site/src/icons/spotify.jpg','image/jpeg'];
const server=http.createServer(async(req,res)=>{try{
 let size=0;const chunks=[],maximum=/^\/api\/devices\/[a-f0-9-]+\/icons$/.test(req.url.split('?')[0])?500000:100000;
 for await(const chunk of req){size+=chunk.length;if(size>maximum){res.writeHead(413);res.end();return;}chunks.push(chunk);}
 const headers=new Headers(req.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-')||key==='cf-connecting-ip')headers.delete(key);
 const request=new Request('http://localhost'+req.url,{method:req.method,headers,body:!['GET','HEAD'].includes(req.method)?Buffer.concat(chunks):undefined});
 let response;const pathname=new URL(request.url).pathname;
 if(pathname==='/readyz'||pathname==='/api/health'){try{await db.command({ping:1},{timeoutMS:3000});response=Response.json({ok:true,database:'mongodb'},{headers:{'Cache-Control':'no-store'}});}catch{response=Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});}}
 else if(pathname==='/healthz')response=Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 else if(pathname.startsWith('/api/'))response=await api(request,req.socket.remoteAddress);else{const asset=assets[pathname];response=asset?new Response(readFileSync(new URL(asset[0],import.meta.url)),{headers:{'Content-Type':asset[1],'Cache-Control':'no-cache'}}):new Response('Not found',{status:404});}
 res.writeHead(response.status,{...Object.fromEntries(response.headers),'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"});
 if(response.body){const stream=Readable.fromWeb(response.body);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}else res.end();
 }catch(error){console.error('HTTP request failed:',error.name);if(!res.headersSent)res.writeHead(500);res.end('Server error');}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(port,host,()=>{console.log(`Closer: http://${host}:${server.address().port}`);console.log('Database: MongoDB · history retained until you delete it');if(!process.env.OWNER_KEY)console.log(`Temporary owner key (enter in Connect phone): ${ownerKey}`);});
async function close(){const timer=setTimeout(()=>process.exit(1),10000);timer.unref();server.close(async()=>{await client.close();clearTimeout(timer);process.exit(0);});server.closeIdleConnections();}process.once('SIGTERM',close);process.once('SIGINT',close);
