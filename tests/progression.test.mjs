import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,startGame,act,view} from '../server/game.mjs';
import {chooseFallback} from '../server/ai.mjs';
test('all five boards can finish actual sequential games, including death chains and final quizzes',()=>{
 for(const size of [8,10,12,14,16])for(let sample=0;sample<5;sample++){
  const r=createRoom({size});startGame(r,r.hostId);
  let n=0;
  while(r.phase!=='ended'&&n++<1500){
   const p=r.pending.actors.find(x=>!r.pending.submitted[x]);assert.ok(p,`No pending actor: ${r.phase}/${r.pending.kind}`);
   const personal=view(r,p);act(r,p,chooseFallback(personal));
  }
  assert.equal(r.phase,'ended',`${size} players did not finish in ${n} actions`);
  assert.ok(r.result);assert.ok(r.log.some(x=>x.kind==='answer'));assert.equal(r.pending,null);
 }
});
