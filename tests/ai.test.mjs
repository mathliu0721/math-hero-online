import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildContext,chooseFallback,Budget,decide,configFromEnv,budgetMonth} from '../server/ai.mjs';
import {createRoom,startGame,view} from '../server/game.mjs';

test('model context receives only personal view, never server room or correct answer',()=>{
 const r=createRoom({name:'测试'});startGame(r,r.hostId);
 const p=r.players.find(p=>p.role==='normal');
 r.pending={kind:'speech',actors:[p.id],submitted:{},deadline:Date.now()+10000};r.phase='day';
 const data=JSON.stringify(buildContext(view(r,p.id)));
 assert.ok(!data.includes('killVotes'));assert.ok(!data.includes('receipts'));
 for(const q of r.players.filter(x=>x.role!=='normal'))assert.ok(!data.includes(`"${q.id}":"${q.role}"`));
});
test('budget reserves worst case and rejects overspending, including parallel reservations',()=>{
 const b=new Budget({limit:100,spent:99});
 const one=b.reserve(0.7);assert.throws(()=>b.reserve(0.5),/预算/);
 b.settle(one,0.3);assert.equal(b.spent,99.3);assert.equal(b.reserved,0);
});
test('monthly budget follows the user Asia/Shanghai calendar boundary',()=>{
 assert.equal(budgetMonth(new Date('2026-10-31T17:00:00Z')),'2026-11');
});
test('unconfigured prices do not silently claim cost protection',()=>{
 const b=new Budget({limit:100});assert.throws(()=>b.reserve(NaN),/单价/);
 const c=configFromEnv({AI_INPUT_PER_MILLION:'',AI_OUTPUT_PER_MILLION:'-1',ASR_PER_MINUTE:''});
 assert.ok(Number.isNaN(c.inputPrice));assert.ok(Number.isNaN(c.outputPrice));assert.ok(Number.isNaN(c.asrPrice));
});
test('without a provider key decision is explicitly a rule bot',async()=>{
 const r=createRoom({});startGame(r,r.hostId);const p=r.players.find(x=>x.role==='outlier');
 const v=view(r,p.id);const result=await decide(v,{},new Budget({limit:100}));
 assert.equal(result.mode,'rules');assert.equal(result.action.type,'kill');
 assert.ok(v.pending.choices.includes(result.action.target));
});
test('fallback knows its own check information and cannot target outlier teammates at night',()=>{
 const r=createRoom({});startGame(r,r.hostId);const p=r.players.find(x=>x.role==='outlier');
 const v=view(r,p.id),a=chooseFallback(v);
 assert.ok(!v.teammates.includes(a.target));assert.notEqual(a.target,p.id);
});
test('a model may play its legal Taylor card before speaking',async()=>{
 const r=createRoom({});startGame(r,r.hostId);const p=r.players[0];p.cards=['taylor'];r.phase='day';r.pending={kind:'speech',actors:[p.id],submitted:{},deadline:Date.now()+10000};
 const old=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({type:'formula',card:'taylor',target:r.players[1].id})}}],usage:{prompt_tokens:1,completion_tokens:1}});
 try{const result=await decide(view(r,p.id),{key:'test',model:'test',base:'https://mock.invalid',inputPrice:1,outputPrice:1},new Budget());assert.equal(result.mode,'model');assert.equal(result.action.type,'formula');}finally{globalThis.fetch=old;}
});
test('a rule bot uses a Taylor card rather than leaving every formula unused',()=>{
 const r=createRoom({});startGame(r,r.hostId);const p=r.players[0];p.cards=['taylor'];r.phase='day';r.pending={kind:'speech',actors:[p.id],submitted:{},deadline:9000};
 assert.equal(chooseFallback(view(r,p.id)).type,'formula');
});
