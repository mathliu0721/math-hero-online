import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';

export class Store {
 constructor(dir){this.dir=dir;this.rooms=new Map();this.queues=new Map();}
 async init(){await mkdir(this.dir,{recursive:true});await mkdir(join(this.dir,'audio'),{recursive:true});try{const d=JSON.parse(await readFile(join(this.dir,'rooms.json'),'utf8'));for(const entry of d)this.rooms.set(entry.room.code,entry);}catch(e){if(e.code!=='ENOENT')throw new Error('房间数据损坏，已停止以避免覆盖：'+e.message);}return this;}
 async save(){
  // Serializes the whole snapshot through one write queue; room operations remain per-room.
  this.writing=(this.writing||Promise.resolve()).catch(()=>{}).then(async()=>{const data=JSON.stringify([...this.rooms.values()]);await writeFile(join(this.dir,'rooms.tmp'),data,{mode:0o600});await rename(join(this.dir,'rooms.tmp'),join(this.dir,'rooms.json'));});await this.writing;
 }
 async serial(code,fn){const prior=this.queues.get(code)||Promise.resolve();const next=prior.catch(()=>{}).then(fn);this.queues.set(code,next);try{return await next;}finally{if(this.queues.get(code)===next)this.queues.delete(code);}}
 async budget(){try{return JSON.parse(await readFile(join(this.dir,'budget.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {};}}
 saveBudget(value){const temp=join(this.dir,'budget.tmp');writeFileSync(temp,JSON.stringify(value),{mode:0o600});renameSync(temp,join(this.dir,'budget.json'));}
}
