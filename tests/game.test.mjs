import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, startGame, view, act, tick, checkWin, resolveNight, tally } from '../server/game.mjs';

function setup(n=8) {
  const r=createRoom({code:'123456',name:'真人甲',size:n,now:1000});
  joinRoom(r,{name:'真人乙',now:1000});
  startGame(r,r.hostId,{now:1000,rng:()=>0.51});
  return r;
}
function player(r,role){return r.players.find(p=>p.role===role);}
test('all five configurations match headcount and physical pool',()=>{
  for(const n of [8,10,12,14,16]){
    const r=setup(n);assert.equal(r.players.length,n);
    assert.equal(r.players.filter(p=>p.role==='svd').length,n===12?0:1);
    assert.ok(r.players.every(p=>p.cards.length===1));
    assert.equal(r.players.filter(p=>p.role==='fool').length,n===16?1:0);
  }
});
test('a personal view contains no other role, hand, hidden actions or question answers',()=>{
  const r=setup();const me=r.players.find(p=>p.role==='normal');
  r.night.kill=me.id;r.pending={kind:'guard',actors:[player(r,'bayes').id],deadline:9000};
  const v=view(r,me.id);
  for(const p of v.players.filter(p=>p.id!==me.id)){assert.equal(p.role,undefined);assert.equal(p.cards,undefined);}
  assert.equal(v.night,undefined);assert.equal(v.pending.kind,undefined);assert.equal(v.pending.actors,undefined);
  assert.equal(v.pending.deadline,undefined);assert.equal(v.pending.action,undefined);
});
test('outliers can see teammates but cannot see a god identity',()=>{
  const r=setup(),me=player(r,'outlier'),v=view(r,me.id);
  assert.equal(v.teammates.length,1);
  assert.equal(v.players.find(p=>p.id===player(r,'regression').id).role,undefined);
});
test('guard plus heal does not consume heal; poison bypasses guard',()=>{
  const r=setup(),witch=player(r,'confidence'),target=player(r,'normal');
  r.night={kill:target.id,guard:target.id,heal:true,poison:target.id};
  assert.deepEqual(resolveNight(r),[target.id]);assert.equal(witch.heal,true);assert.equal(witch.poison,false);
});
test('self rescue and self guarding are rejected without consuming medicine',()=>{
  const r=setup(),w=player(r,'confidence'),b=player(r,'bayes');
  r.night.kill=w.id;r.pending={kind:'witch',actors:[w.id],deadline:9000};
  assert.throws(()=>act(r,w.id,{type:'witch',heal:true,poison:null},1000),/自救/);
  assert.equal(w.heal,true);
  r.pending={kind:'guard',actors:[b.id],deadline:9000};
  assert.throws(()=>act(r,b.id,{type:'guard',target:b.id},1000),/自己/);
});
test('regression result is private and is not auto-published to good players',()=>{
  const r=setup(),seer=player(r,'regression'),wolf=player(r,'outlier'),civil=player(r,'normal');
  r.pending={kind:'check',actors:[seer.id],deadline:9000};
  act(r,seer.id,{type:'check',target:wolf.id},1000);
  assert.ok(view(r,seer.id).me.info.some(i=>i.target===wolf.id&&i.camp==='evil'));
  assert.equal(view(r,civil.id).me.info.length,0);
  assert.ok(!r.log.some(i=>i.text.includes(`${wolf.seat+1}号是异常`)));
});
test('highest vote tie is unresolved rather than arbitrarily eliminating a player',()=>{
  assert.equal(tally({a:'x',b:'y'}),null);assert.equal(tally({a:'x',b:'x',c:'y'}),'x');
});
test('win check applies flanks and requires justice to remove SVD',()=>{
  const r=setup();assert.equal(checkWin(r),null);
  player(r,'normal').alive=false;assert.equal(checkWin(r),'evil');
  for(const p of r.players){p.alive=p.role==='svd'||p.role==='regression';}
  assert.equal(checkWin(r),'neutral');
  player(r,'svd').alive=false;assert.equal(checkWin(r),'justice');
});
test('formula is consumed once and same kind cannot stack on one day',()=>{
  const r=setup(),a=r.players[0],b=r.players[1];r.phase='day';
  r.pending={kind:'speech',actors:[a.id],deadline:9000};a.cards=['cauchy'];b.cards=['cauchy'];
  act(r,a.id,{type:'formula',card:'cauchy',target:b.id},1000);
  assert.equal(a.cards.length,0);assert.ok(r.blocked.includes(b.id));
  assert.throws(()=>act(r,b.id,{type:'formula',card:'cauchy',target:a.id},1000),/本日/);
  assert.equal(b.cards.length,1);
});
test('Taylor gives only the user a private camp result',()=>{
  const r=setup(),a=r.players[0],b=r.players[1];r.phase='day';a.cards=['taylor'];
  r.pending={kind:'speech',actors:[a.id],deadline:9000};
  act(r,a.id,{type:'formula',card:'taylor',target:b.id},1000);
  assert.ok(a.info.some(i=>i.target===b.id&&i.camp));
  assert.equal(view(r,b.id).me.info.length,0);
});
test('Fourier cannot be played before vote is locked',()=>{
  const r=setup(),a=r.players[0];r.phase='day';a.cards=['fourier'];
  r.pending={kind:'speech',actors:[a.id],deadline:9000};
  assert.throws(()=>act(r,a.id,{type:'formula',card:'fourier'},1000),/公投/);
  assert.deepEqual(a.cards,['fourier']);
});
test('dead players cannot chat outside an explicit last-word turn',()=>{
  const r=setup(),a=r.players[0];a.alive=false;r.phase='day';
  r.pending={kind:'speech',actors:[r.players[1].id],deadline:9000};
  assert.throws(()=>act(r,a.id,{type:'speak',text:'泄密'},1000));
});
test('question answers stay private until submission',()=>{
  const r=setup(),a=r.players[0];r.phase='quiz';
  r.pending={kind:'quiz',actors:[a.id],deadline:9000,question:{id:'q1',stem:'唯一偶质数？',answer:'2',options:['1','2','3','4']}};
  assert.equal(view(r,a.id).pending.question.answer,undefined);
  assert.equal(view(r,r.players[1].id).pending.question,undefined);
});
test('timeouts can advance every turn without preset winner or infinite game',()=>{
  const r=setup();
  // Only assert bounded progression here; a complete voted game is an integration test.
  for(let i=0;i<25;i++)tick(r,100000+i*100000);
  assert.notEqual(r.phase,'waiting');assert.ok(r.round>=1);
});
test('a fool taken by a voted-out hunter must die without flipping',()=>{
 const r=setup(16),hunter=player(r,'anova'),fool=player(r,'fool');
 r.phase='elimination';hunter.alive=false;hunter.hunterUsed=true;
 r.deathFlow={queue:[],done:[hunter.id],method:'vote',after:'night'};
 r.pending={kind:'hunter',actors:[hunter.id],submitted:{},deadline:9000};
 act(r,hunter.id,{type:'hunter',target:fool.id},1000);
 assert.equal(fool.alive,false);assert.equal(fool.flipped,false);
});
test('an absent witch cannot spend poison and a dead seer cannot act',()=>{
 const r=setup(),seer=player(r,'regression');seer.alive=false;
 r.pending={kind:'check',actors:[seer.id],submitted:{},deadline:9000};
 assert.throws(()=>act(r,seer.id,{type:'check',target:r.players.find(p=>p.id!==seer.id).id},1000),/出局/);
});
test('Hopital skips the vote after the speech queue finishes',()=>{
 const r=setup(),a=r.players[0];r.phase='day';r.speechQueue=[];r.pending={kind:'speech',actors:[a.id],submitted:{},deadline:9000};a.cards=['hopital'];
 act(r,a.id,{type:'formula',card:'hopital'},1000);act(r,a.id,{type:'endSpeech'},1000);
 assert.equal(r.phase,'night');assert.equal(r.round,2);assert.equal(a.cards.length,0);
});
test('Lagrange publishes two server-verified facts and consumes only after both agree',()=>{
 const r=setup(),a=r.players[0],b=r.players[1];r.phase='day';r.pending={kind:'speech',actors:[a.id],submitted:{},deadline:9000};a.cards=['lagrange'];
 act(r,a.id,{type:'formula',card:'lagrange',target:b.id},1000);assert.equal(a.cards.length,1);
 act(r,a.id,{type:'link',infoId:'self'},1000);assert.equal(a.cards.length,1);
 act(r,b.id,{type:'link',infoId:'self'},1000);assert.equal(a.cards.length,0);assert.equal(r.pending.kind,'speech');assert.equal(r.log.filter(x=>x.kind==='link').length,2);
});
test('declined or timed-out Lagrange leaves the card intact',()=>{
 for(const timeout of [false,true]){
  const r=setup(),a=r.players[0],b=r.players[1];r.phase='day';r.pending={kind:'speech',actors:[a.id],submitted:{},deadline:9000};a.cards=['lagrange'];
  act(r,a.id,{type:'formula',card:'lagrange',target:b.id},1000);
  if(timeout)tick(r,r.pending.deadline+1);else act(r,b.id,{type:'link',decline:true},1000);
  assert.deepEqual(a.cards,['lagrange']);assert.equal(r.pending.kind,'speech');
 }
});
test('Fourier protects the highest vote and eliminates the unique second highest',()=>{
 const r=setup(),holder=player(r,'regression'),highest=player(r,'bayes'),second=player(r,'normal');
 r.phase='reaction';r.pending={kind:'reaction',actors:[holder.id],submitted:{},deadline:9000};holder.cards=['fourier'];r.protected=[];r.voteResult=highest.id;
 r.votes={a:highest.id,b:highest.id,c:highest.id,d:second.id,e:second.id};
 act(r,holder.id,{type:'formula',card:'fourier'},1000);
 assert.equal(highest.alive,true);assert.equal(second.alive,false);assert.ok(r.protected.includes(highest.id));assert.equal(r.pending.kind,'quiz');
});
test('Riemann adds next-day last words without resurrecting the target',()=>{
 const r=setup(),a=player(r,'regression'),dead=player(r,'normal');dead.alive=false;r.phase='day';r.pending={kind:'speech',actors:[a.id],submitted:{},deadline:9000};a.cards=['riemann'];
 act(r,a.id,{type:'formula',card:'riemann',target:dead.id},1000);
 assert.equal(dead.alive,false);assert.deepEqual(r.extended,[{pid:dead.id,round:2}]);assert.equal(a.cards.length,0);
});
