import {DatabaseSync} from 'node:sqlite';
import {MongoClient} from 'mongodb';
import {existsSync} from 'node:fs';
import {initializeMongo} from '../server/mongo-api.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
const source=process.argv[2]||'data/closer.db';if(!existsSync(source))throw Error('SQLite source file does not exist: '+source);
const sqlite=new DatabaseSync(source,{readOnly:true}),client=new MongoClient(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017');
try{await client.connect();const db=client.db(process.env.MONGODB_DATABASE||'closer');await initializeMongo(db);let deviceCount=0,dayCount=0,iconCount=0;
 for(const row of sqlite.prepare('SELECT * FROM devices').all()){
  const result=await db.collection('devices').updateOne({_id:row.id},{$setOnInsert:{name:row.name,writerHash:row.writer_hash,viewerHash:row.viewer_hash,updatedAt:row.updated,paused:!!row.paused,snapshot:row.snapshot?JSON.parse(row.snapshot):null,iconVersion:row.icon_version||0,activeSessionId:null,createdAt:Date.now()}},{upsert:true});deviceCount+=result.upsertedCount;
 }
 for(const row of sqlite.prepare('SELECT * FROM days').all()){const result=await db.collection('days').updateOne({_id:row.device_id+':'+row.day},{$setOnInsert:{deviceId:row.device_id,day:row.day,snapshot:JSON.parse(row.snapshot)}},{upsert:true});dayCount+=result.upsertedCount;}
 if(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_icons'").get())for(const row of sqlite.prepare('SELECT * FROM app_icons').all()){const result=await db.collection('app_icons').updateOne({deviceId:row.device_id,packageName:row.package_name},{$setOnInsert:{data:row.data}},{upsert:true});iconCount+=result.upsertedCount;}
 console.log(`Imported ${deviceCount} devices, ${dayCount} days and ${iconCount} icons. Existing MongoDB records and the SQLite source were preserved.`);
}finally{sqlite.close();await client.close();}
