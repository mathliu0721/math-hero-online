import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../server/http.mjs';
import {chooseFallback} from '../server/ai.mjs';

test('two sessions share a room; tokens bind seats, actions are versioned and idempotent; restart restores room',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shumoxia-test-'));
 let app=await createServer({dataDir:dir,auto:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 let base=`http://127.0.0.1:${app.address().port}`;
 async function req(path,method='GET',data,token){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json()};}
 try{
  const a=await req('/api/rooms','POST',{name:'甲',size:8});assert.equal(a.status,201);const code=a.data.state.code;
  const b=await req(`/api/rooms/${code}/join`,'POST',{name:'乙'});assert.equal(b.status,201);
  const current=await req(`/api/rooms/${code}/state`,'GET',null,a.data.token);assert.equal(current.data.state.players.length,2);
  const action={actionId:'start-test-1',revision:current.data.state.revision,type:'start'};
  const bad=await req(`/api/rooms/${code}/action`,'POST',action,b.data.token);assert.equal(bad.status,400);
  const start=await req(`/api/rooms/${code}/action`,'POST',action,a.data.token);assert.equal(start.status,200);
  const again=await req(`/api/rooms/${code}/action`,'POST',action,a.data.token);assert.equal(again.status,200);assert.equal(again.data.state.round,1);
  const unauth=await req(`/api/rooms/${code}/state`);assert.equal(unauth.status,401);
  const spoof=await req(`/api/rooms/${code}/action`,'POST',{actionId:'spoof-2',revision:start.data.state.revision,playerId:a.data.state.me.id,type:'start'},b.data.token);assert.notEqual(spoof.status,200);
  const stale=await req(`/api/rooms/${code}/action`,'POST',{actionId:'stale-1',revision:-1,type:'kill',target:null},a.data.token);assert.equal(stale.status,409);
  const other=await req(`/api/rooms/${code}/state`,'GET',null,b.data.token);assert.equal(other.data.state.me.name,'乙');assert.equal(other.data.state.players.length,8);
  await new Promise(r=>app.close(r));
  app=await createServer({dataDir:dir,auto:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;
  const restored=await req(`/api/rooms/${code}/state`,'GET',null,b.data.token);assert.equal(restored.status,200);assert.equal(restored.data.state.phase,'night');
 }finally{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true});}
});

test('concurrent TTS deduplicates billing and commits audio to the current room after another action',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shumoxia-tts-'));
 const original=globalThis.fetch;let release,calls=0;const gate=new Promise(r=>release=r);
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('https://mock-voice.invalid')){calls++;await gate;return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}});}
  return original(url,options);
 };
 const app=await createServer({dataDir:dir,auto:false,config:{key:'mock',base:'https://mock-voice.invalid',ttsPrice:1,ttsModel:'mock',ttsVoice:'mock'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.address().port}`;
 async function req(path,method='GET',data,token){const r=await original(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json()};}
 try{
  const a=(await req('/api/rooms','POST',{name:'甲',size:8})).data,code=a.state.code;
  const b=(await req(`/api/rooms/${code}/join`,'POST',{name:'乙'})).data;
  const entry=app.application.store.rooms.get(code);entry.room.phase='day';entry.room.pending={kind:'speech',actors:[a.state.me.id],submitted:{},deadline:Date.now()+60000};entry.room.log.push({id:'message-tts',kind:'chat',actor:a.state.me.id,text:'公开发言',time:Date.now()});
  const one=req(`/api/rooms/${code}/tts`,'POST',{messageId:'message-tts'},a.token);
  while(!calls)await new Promise(r=>setTimeout(r,2));
  const two=req(`/api/rooms/${code}/tts`,'POST',{messageId:'message-tts'},b.token);
  await new Promise(r=>setTimeout(r,20));
  await req(`/api/rooms/${code}/action`,'POST',{type:'speak',text:'新的公开发言',revision:entry.room.revision,actionId:'speak-tts-test'},a.token);
  release();const [x,y]=await Promise.all([one,two]);
  assert.equal(calls,1);assert.equal(x.data.audioId,y.data.audioId);
  const clip=await original(base+`/api/rooms/${code}/audio/${x.data.audioId}`,{headers:{Authorization:'Bearer '+b.token}});assert.equal(clip.status,200);
 }finally{globalThis.fetch=original;await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true});}
});

test('two authenticated human clients plus six bots finish a real shared game',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'shumoxia-full-'));
 const app=await createServer({dataDir:dir,auto:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.address().port}`;
 async function req(path,method='GET',data,token){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
 try{
  const a=await req('/api/rooms','POST',{name:'网页玩家',size:8}),code=a.state.code;
  const b=await req(`/api/rooms/${code}/join`,'POST',{name:'微信协议玩家'});
  const current=await req(`/api/rooms/${code}/state`,'GET',null,a.token);
  await req(`/api/rooms/${code}/action`,'POST',{type:'start',actionId:'full-start',revision:current.state.revision},a.token);
  let rounds=0,completed=null,humanActions=0;
  for(let i=0;i<600;i++){
   const sa=await req(`/api/rooms/${code}/state`,'GET',null,a.token);if(sa.state.phase==='ended'){completed=sa.state;break;}
   let acted=false;
   for(const token of [a.token,b.token]){
    const personal=await req(`/api/rooms/${code}/state`,'GET',null,token);
    if(personal.state.pending?.myTurn){const choice=chooseFallback(personal.state);await req(`/api/rooms/${code}/action`,'POST',{...choice,actionId:`human-${i}-${humanActions++}`,revision:personal.state.revision},token);acted=true;break;}
   }
   if(!acted)await app.application.pump(code,{immediate:true});
   rounds++;
  }
  assert.ok(completed,'shared game must reach actual settlement');assert.ok(humanActions>2);assert.equal(completed.players.length,8);
  const other=await req(`/api/rooms/${code}/state`,'GET',null,b.token);assert.equal(other.state.result,completed.result);
 }finally{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true});}
});
