import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(existsSync('.env')){console.error('.env already exists; it was not changed.');process.exit(1);}
let content=readFileSync('.env.example','utf8');
for(const key of ['OWNER_KEY','MONGO_PASSWORD','MONGO_ROOT_PASSWORD'])content=content.replace(new RegExp('^'+key+'=.*$','m'),key+'='+randomBytes(32).toString('hex'));
writeFileSync('.env',content,{mode:0o600,flag:'wx'});
console.log('Created .env with random secrets. Set CLOSER_DOMAIN before deploying.');
