import http from 'node:http';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve,extname,sep} from 'node:path';
import {Store} from './store.mjs';
import {createRoom,joinRoom,act,view,tick} from './game.mjs';
import {Budget,decide,chooseFallback,configFromEnv} from './ai.mjs';
import {pcmToWav,transcribe,synthesize} from './voice.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const hash=s=>createHash('sha256').update(s).digest('hex');
function error(message,status=400){const e=new Error(message);e.status=status;throw e;}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
async function body(req,max=24000){const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>max)error('请求内容过大',413);chunks.push(chunk);}return Buffer.concat(chunks);}
async function jsonBody(req){try{return JSON.parse((await body(req)).toString()||'{}');}catch(e){if(e.status)throw e;error('JSON格式不正确');}}

export async function createServer({dataDir=join(ROOT,'.data'),auto=true,config=configFromEnv(),limit=100}={}){
 const store=await new Store(dataDir).init(),budget=new Budget({...await store.budget(),limit,onChange:s=>store.saveBudget(s)});
 const jobs=new Map(),speechJobs=new Map(),rates=new Map();let closed=false;
 const services=()=>({modelConfigured:!!(config.key&&config.model&&Number.isFinite(config.inputPrice)&&Number.isFinite(config.outputPrice)),asrConfigured:!!(config.key&&Number.isFinite(config.asrPrice)),ttsConfigured:!!(config.key&&Number.isFinite(config.ttsPrice)),budget:budget.snapshot()});
 function tokenFor(entry,pid){const token=randomBytes(32).toString('base64url');entry.tokens[hash(token)]=pid;return token;}
 function authorize(entry,req){const raw=req.headers.authorization||'';const pid=entry.tokens[hash(raw.startsWith('Bearer ')?raw.slice(7):'')];if(!pid)error('请重新加入房间或恢复原设备会话',401);return pid;}
 function responseView(entry,pid){return {state:view(entry.room,pid),services:services()};}
 async function pump(code,{immediate=false}={}){
  if(closed||jobs.has(code))return;
  const entry=store.rooms.get(code);if(!entry||!entry.room.pending)return;
  jobs.set(code,true);
  try{
   let work;
   await store.serial(code,async()=>{
    const r=entry.room;if(tick(r)){r.revision++;await store.save();}
    if(!r.pending)return;
    const bot=r.players.find(p=>p.bot&&r.pending.actors.includes(p.id)&&!r.pending.submitted?.[p.id]);
    if(bot)work={pid:bot.id,turn:r.turnId,personal:view(r,bot.id)};
   });
   if(!work)return;
   if(!immediate)await new Promise(r=>setTimeout(r,['speech','lastwords'].includes(work.personal.pending?.action)?1800:550));
   if(closed)return;
   const decision=await decide(work.personal,config,budget);
   await store.serial(code,async()=>{
    const r=entry.room;
    if(r.turnId!==work.turn||!r.pending?.actors.includes(work.pid)||r.pending.submitted?.[work.pid])return;
    const next=structuredClone(r);
    try{act(next,work.pid,decision.action);}catch(e){act(next,work.pid,chooseFallback(view(r,work.pid)));decision.mode='rules';decision.reason='模型动作校验未通过，改用规则动作';}
    const bot=next.players.find(p=>p.id===work.pid);bot.lastMode=decision.mode;
    next.aiStatus={mode:decision.mode,reason:decision.reason,time:Date.now()};next.revision++;
    entry.room=next;await store.save();
   });
  }catch(e){console.error('房间推进失败：'+e.message);}finally{jobs.delete(code);}
 }
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  const allowed=process.env.ALLOWED_ORIGINS?.split(',').map(x=>x.trim()).filter(Boolean)||[];
  if(origin&&(allowed.includes(origin)||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   if(path.startsWith('/api/')){
    const ip=req.socket.remoteAddress,now=Date.now();let rate=rates.get(ip);if(!rate||now-rate.start>60000){rate={start:now,count:0,creates:0};rates.set(ip,rate);}
    if(++rate.count>1000)error('请求过于频繁，请稍后再试',429);
    if(path==='/api/health'){send(200,{ok:true,...services()});return;}
    if(path==='/api/rooms'&&req.method==='POST'){
     if(++rate.creates>20)error('创建过于频繁',429);if(store.rooms.size>=50)error('当前演示服务的房间已满，请管理员清理过期房间',503);
     const data=await jsonBody(req);let room;do{room=createRoom({name:data.name,size:Number(data.size)||8,pro:!!data.pro});}while(store.rooms.has(room.code));
     const entry={room,tokens:{},audio:{}};const token=tokenFor(entry,room.hostId);store.rooms.set(room.code,entry);await store.save();send(201,{token,...responseView(entry,room.hostId)});return;
    }
    const match=path.match(/^\/api\/rooms\/(\d{6})\/(join|state|action|tick|audio|tts|replay)(?:\/([a-zA-Z0-9_-]+))?$/);
    if(!match)error('接口不存在',404);
    const [,code,operation,file]=match,entry=store.rooms.get(code);if(!entry)error('房间不存在，请检查六位房间号',404);
    if(operation==='join'&&req.method==='POST'){
     const data=await jsonBody(req);const result=await store.serial(code,async()=>{const p=joinRoom(entry.room,{name:data.name});const token=tokenFor(entry,p.id);entry.room.revision++;await store.save();return {token,...responseView(entry,p.id)};});send(201,result);return;
    }
    const pid=authorize(entry,req);
    if(operation==='state'&&req.method==='GET'){send(200,{...responseView(entry,pid),aiStatus:entry.room.aiStatus||null});return;}
    if(operation==='tick'&&req.method==='POST'){void pump(code);send(200,responseView(entry,pid));return;}
    if(operation==='action'&&req.method==='POST'){
     const a=await jsonBody(req);requireActionId(a.actionId);
     const result=await store.serial(code,async()=>{
      const r=entry.room,key=pid+':'+a.actionId,digest=hash(JSON.stringify({...a,actionId:undefined}));
      const receipt=r.receipts.find(x=>x.key===key);
      if(receipt){if(receipt.digest!==digest)error('同一动作编号不能用于不同请求',409);return responseView(entry,pid);}
      if(a.revision!==r.revision)error('房间已有新变化，请刷新后重试',409);
      if(a.audioId){const clip=entry.audio[a.audioId];if(!clip||clip.player!==pid||clip.turn!==r.turnId)error('该录音不属于本次发言');}
      const next=structuredClone(r);act(next,pid,a);next.revision++;next.receipts.push({key,digest});next.receipts=next.receipts.slice(-500);entry.room=next;await store.save();return responseView(entry,pid);
     });send(200,result);return;
    }
    if(operation==='audio'&&req.method==='POST'){
     const r=entry.room,t=r.pending;if(!t||!['speech','lastwords'].includes(t.kind)||!t.actors.includes(pid))error('只能在自己的发言回合录音');
     const turn=r.turnId;let wav=await body(req,1920044);if(req.headers['content-type']==='audio/pcm')wav=pcmToWav(wav);
     const text=await transcribe(wav,config,budget);
     if(entry.room.turnId!==turn)error('本次发言回合已结束');
     const clipId=randomUUID();await writeFile(join(dataDir,'audio',clipId+'.wav'),wav,{mode:0o600});entry.audio[clipId]={player:pid,turn,type:'audio/wav'};await store.save();send(200,{text,audioId:clipId});return;
    }
    if(operation==='audio'&&req.method==='GET'){
     const clip=entry.audio[file];if(!clip)error('录音不存在',404);
     if(!entry.room.log.some(x=>x.audioId===file)&&clip.player!==pid)error('录音尚未公开',403);
     const audio=await readFile(join(dataDir,'audio',file+(clip.type==='audio/mpeg'?'.mp3':'.wav')));res.writeHead(200,{'Content-Type':clip.type,'Cache-Control':'private,max-age=3600'});res.end(audio);return;
    }
    if(operation==='tts'&&req.method==='POST'){
     const {messageId}=await jsonBody(req);const message=entry.room.log.find(x=>x.id===messageId&&x.kind==='chat');if(!message)error('发言不存在');
     const cacheKey='tts_'+message.id;
     let clipId=entry.audio[cacheKey]?.id;
     if(!clipId){
      const jobKey=code+':'+messageId;
      if(!speechJobs.has(jobKey)){
       const job=(async()=>{
        const bytes=await synthesize(message.text,config,budget),newId=randomUUID();await writeFile(join(dataDir,'audio',newId+'.mp3'),bytes,{mode:0o600});
        await store.serial(code,async()=>{
         const current=entry.room.log.find(x=>x.id===messageId);if(!current)error('原发言已不存在');
         entry.audio[newId]={player:current.actor,type:'audio/mpeg'};entry.audio[cacheKey]={id:newId};current.audioId=newId;entry.room.revision++;await store.save();
        });return newId;
       })();speechJobs.set(jobKey,job);
      }
      const job=speechJobs.get(jobKey);try{clipId=await job;}finally{if(speechJobs.get(jobKey)===job)speechJobs.delete(jobKey);}
     }
     send(200,{audioId:clipId});return;
    }
    if(operation==='replay'&&req.method==='GET'){
     if(entry.room.phase!=='ended')error('对局结束后才能查看回放',403);send(200,{code,round:entry.room.round,winner:entry.room.result,players:entry.room.players.map(p=>({seat:p.seat,name:p.name,role:p.role,badge:p.badge})),log:entry.room.log});return;
    }
    error('不支持的请求',405);
   }
   if(req.method!=='GET')error('不支持的请求',405);
   let relative;try{relative=decodeURIComponent(path);}catch{error('地址格式不正确');}
   const target=resolve(ROOT,'public','.'+(relative==='/'?'/index.html':relative));const publicRoot=resolve(ROOT,'public');
   if(!target.startsWith(publicRoot+sep))error('禁止访问',403);
   const bytes=await readFile(target).catch(e=>{if(e.code==='ENOENT')error('文件不存在',404);throw e;});
   res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; media-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"});res.end(bytes);
  }catch(e){if(!res.headersSent)send(e.status||400,{error:e.message});else res.end();}
 });
 let interval;
 if(auto){interval=setInterval(()=>{for(const code of store.rooms.keys())void pump(code);},350);interval.unref();}
 server.on('close',()=>{closed=true;clearInterval(interval);});
 server.application={store,budget,pump,services};
 return server;
}
function requireActionId(value){if(typeof value!=='string'||value.length<4||value.length>100)error('请提供合法的动作编号');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await createServer({limit:Math.min(100,Number(process.env.MONTHLY_BUDGET_CNY)||100)});
 const port=Number(process.env.PORT)||8787,host=process.env.HOST||'127.0.0.1';server.listen(port,host,()=>{console.log(`数模侠已启动：http://127.0.0.1:${port}`);console.log(host==='0.0.0.0'?'局域网访问已启用，请用本机局域网IP和相同端口访问。':'仅本机访问；局域网演示可使用 启动局域网.ps1。');console.log(server.application.services().modelConfigured?'模型AI已配置，等待真实调用验证。':'当前是明确标记的规则机器人模式。');});
}
