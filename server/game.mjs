import { randomUUID, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ROLES, FORMULAS } from '../shared/content.mjs';

const QUESTIONS=JSON.parse(readFileSync(new URL('./questions.json',import.meta.url),'utf8'));
const CONFIG={8:[2,1,1],10:[3,1,2],12:[4,0,4],14:[4,1,5],16:[5,1,5]};
const names=['青禾','阿澈','知微','南星','砚秋','予安','星野','沐白','云舟','清和','时雨','明川','林鹿','以宁','初弦','苏木'];
const id=()=>randomUUID();
const clone=v=>structuredClone(v);
function fail(message){throw new Error(message);}
function requireThat(ok,message){if(!ok)fail(message);}
function shuffle(a,rng=()=>randomInt(0,1000000)/1000000){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.min(i,Math.floor(rng()*(i+1)));[a[i],a[j]]=[a[j],a[i]];}return a;}
const camp=p=>ROLES[p.role]?.camp;
const alive=r=>r.players.filter(p=>p.alive);
const get=(r,pid)=>r.players.find(p=>p.id===pid)||fail('找不到玩家');
const god=p=>!['normal','outlier','svd'].includes(p.role);
function addLog(r,text,kind='system',actor=null,extra={}){r.log.push({id:id(),text,kind,actor,round:r.round,time:Date.now(),...extra});}
function privateInfo(r,pid,target,source){const p=get(r,pid),t=get(r,target);const item={id:id(),target,seat:t.seat,camp:camp(t),source,round:r.round};p.info.push(item);return item;}
const seconds={kill:25,guard:20,check:20,witch:25,absorb:15,speech:60,vote:35,reaction:8,hunter:20,quiz:40,lastwords:30,link:25};
function pending(r,kind,actors,now,extra={}){r.pending={kind,actors,deadline:now+seconds[kind]*1000,submitted:{},...extra};r.turnId=id();}

export function createRoom({code,name='玩家',size=8,now=Date.now(),pro=false}={}){
  requireThat(CONFIG[size],'支持8、10、12、14、16人局');
  const p={id:id(),name:String(name).trim().slice(0,16)||'玩家',seat:0,bot:false,alive:true,cards:[],info:[],badge:0};
  return {code:code||String(randomInt(100000,999999)),hostId:p.id,size,pro,players:[p],phase:'waiting',round:0,revision:0,log:[],night:{},votes:{},pending:null,used:[],blocked:[],questions:[],extended:[],createdAt:now,result:null,receipts:[],rulesVersion:'v2+v4·吞噬',turnId:id()};
}
export function joinRoom(r,{name='玩家',now=Date.now()}={}){
  requireThat(r.phase==='waiting','已开局，请等待下一局');requireThat(r.players.length<r.size,'房间已满');
  const p={id:id(),name:String(name).trim().slice(0,16)||'玩家',seat:r.players.length,bot:false,alive:true,cards:[],info:[],badge:0};r.players.push(p);return p;
}
export function startGame(r,actor,{now=Date.now(),rng}={}){
  requireThat(actor===r.hostId,'只有房主能开局');requireThat(r.phase==='waiting','已开局');
  while(r.players.length<r.size){const i=r.players.length;r.players.push({id:id(),name:names[i],seat:i,bot:true,alive:true,cards:[],info:[],badge:0});}
  const [wolves,svd,civ]=CONFIG[r.size];
  const roles=shuffle([...Array(wolves).fill('outlier'),'regression','confidence','anova','bayes',...(r.size===16?['fool']:[]),...Array(svd).fill('svd'),...Array(civ).fill('normal')],rng);
  const deck=shuffle(Object.keys(FORMULAS).flatMap(c=>[c,c,c]),rng);
  r.players.forEach((p,i)=>Object.assign(p,{role:roles[i],cards:[deck[i]],heal:true,poison:true,flipped:false,hunterUsed:false,info:[],badge:0,alive:true}));
  addLog(r,`${r.size}位玩家已就座，身份与公式卡已私密发放。`);
  beginNight(r,now);
}
function beginNight(r,now){
  r.phase='night';r.round++;r.night={killVotes:{},kill:null,guard:null,heal:false,poison:null,deaths:[]};r.blocked=[];r.used=[];
  addLog(r,`第${r.round}夜，请等待自己的私密行动提示。`);
  nightStep(r,'kill',now);
}
function nightStep(r,kind,now){
  const role={kill:'outlier',guard:'bayes',check:'regression',witch:'confidence',absorb:'svd'}[kind];
  let actors=alive(r).filter(p=>p.role===role).map(p=>p.id);
  if(kind==='absorb')actors=actors.filter(p=>!r.night.deaths.includes(p));
  if(kind==='absorb'&&!r.night.deaths.length)actors=[];
  pending(r,kind,actors,now);
  if(!actors.length)advance(r,now);
}
export function resolveNight(r){
  const n=r.night,deaths=[];const w=alive(r).find(p=>p.role==='confidence');
  if(n.kill){if(n.guard===n.kill){}else if(n.heal&&w?.heal){w.heal=false;}else deaths.push(n.kill);}
  if(n.poison&&w?.poison){w.poison=false;if(!deaths.includes(n.poison))deaths.push(n.poison);}
  return deaths;
}
export function tally(votes,excluded=[]){
  const counts={};for(const target of Object.values(votes))if(target&&!excluded.includes(target))counts[target]=(counts[target]||0)+1;
  const max=Math.max(0,...Object.values(counts)),top=Object.keys(counts).filter(k=>counts[k]===max);
  return top.length===1?top[0]:null;
}
export function checkWin(r){
  const a=alive(r),wolves=a.filter(p=>p.role==='outlier').length,svd=a.some(p=>p.role==='svd');
  if(!wolves&&!svd)return 'justice';
  const totalGod=r.players.some(god),totalCiv=r.players.some(p=>p.role==='normal');
  if(wolves&&((totalGod&&!a.some(god))||(totalCiv&&!a.some(p=>p.role==='normal'))))return 'evil';
  if(!wolves&&svd&&a.filter(p=>camp(p)==='justice').length<=1)return 'neutral';
  return null;
}
function settle(r){const win=checkWin(r);if(!win)return false;r.phase='ended';r.result=win;r.pending=null;r.turnId=id();addLog(r,`${{justice:'正义阵营',evil:'异常阵营',neutral:'奇异值分解'}[win]}获胜。全部身份已揭晓。`,'result');return true;}
function startDeaths(r,targets,method,after,now){
  r.phase='elimination';r.deathFlow={queue:[...new Set(targets)],done:[],method,after};processDeaths(r,now);
}
function processDeaths(r,now){
  const f=r.deathFlow;
  while(f.queue.length){
    const pid=f.queue.shift(),p=get(r,pid);if(!p.alive)continue;
    if(f.method==='vote'&&!f.hunterTargets?.includes(pid)&&p.role==='fool'&&!p.flipped){p.flipped=true;addLog(r,`${p.seat+1}号大数定律翻牌免死，本局仍保留投票权。`);continue;}
    p.alive=false;f.done.push(pid);addLog(r,`${p.seat+1}号${p.name}已出局。`,'death',pid);
    if(p.role==='anova'&&!p.hunterUsed){p.hunterUsed=true;pending(r,'hunter',[pid],now);return;}
  }
  f.quizQueue=[...f.done];nextQuiz(r,now);
}
function nextQuiz(r,now){
  const f=r.deathFlow;
  if(f.quizQueue.length){
    const pid=f.quizQueue.shift();r.phase='quiz';
    let pool=QUESTIONS.filter(q=>(r.pro||q.category==='trivia')&&!r.questions.includes(q.id));
    if(!pool.length)pool=QUESTIONS.filter(q=>!r.questions.includes(q.id));
    const q=clone(pool[randomInt(pool.length)]);r.questions.push(q.id);
    // Retain original card prompt and answer. Proof cards ask for the matching method,
    // not a purported automatic proof grade.
    const alternatives=shuffle(QUESTIONS.filter(x=>x.id!==q.id&&x.answer!==q.answer)).slice(0,3).map(x=>x.answer);
    q.options=shuffle([q.answer,...alternatives]);
    pending(r,'quiz',[pid],now,{question:q});return;
  }
  const after=f.after;delete r.deathFlow;
  if(settle(r))return;
  if(after==='day')beginDay(r,now);else if(after==='night')beginNight(r,now);
}
function beginDay(r,now){
  r.phase='day';r.used=[];r.blocked=[];r.skipVote=false;r.voteAttempt=0;r.protected=[];
  addLog(r,`第${r.round}天，按座位轮流发言。`);
  const extensions=r.extended.filter(e=>e.round===r.round);r.extended=r.extended.filter(e=>e.round!==r.round);
  r.speechQueue=[...extensions.map(e=>({pid:e.pid,kind:'lastwords'})),...alive(r).map(p=>({pid:p.id,kind:'speech'}))];
  nextSpeech(r,now);
}
function nextSpeech(r,now){
  while(r.speechQueue?.length){const t=r.speechQueue.shift();if(t.kind==='speech'&&!get(r,t.pid).alive)continue;pending(r,t.kind,[t.pid],now,{extended:t.kind==='lastwords'});return;}
  if(r.skipVote){addLog(r,'洛必达法则生效，本日跳过公投。');beginNight(r,now);return;}
  beginVote(r,now);
}
function beginVote(r,now){r.phase='vote';r.votes={};pending(r,'vote',alive(r).filter(p=>!r.blocked.includes(p.id)).map(p=>p.id),now);if(!r.pending.actors.length)finishVote(r,now);}
function finishVote(r,now){
  r.phase='reaction';r.voteResult=tally(r.votes,r.protected||[]);
  addLog(r,r.voteResult?`公投已锁定，${get(r,r.voteResult).seat+1}号暂居最高票，进入公式反应窗口。`:'公投已锁定，最高票平票或全体弃票。','vote',null,{votes:clone(r.votes)});
  pending(r,'reaction',alive(r).filter(p=>p.cards.includes('fourier')&&!r.used.includes('fourier')).map(p=>p.id),now);
  if(!r.pending.actors.length)finalizeVote(r,now);
}
function finalizeVote(r,now){
  const target=r.voteResult;
  if(!target){if(r.voteAttempt===0){r.voteAttempt=1;addLog(r,'平票，进入一次补充发言后重投。');r.phase='day';r.speechQueue=alive(r).map(p=>({pid:p.id,kind:'speech'}));nextSpeech(r,now);return;}
    addLog(r,'再次平票，本日无人出局。');if(!settle(r))beginNight(r,now);return;
  }
  startDeaths(r,[target],'vote','night',now);
}
function finishLink(r,now,commit=true){
  const link=r.link;if(commit&&Object.keys(link.selections).length===2){
    for(const pid of [link.from,link.to]){const info=link.selections[pid];const t=get(r,info.target);addLog(r,`公开连线：${get(r,pid).seat+1}号公开 ${t.seat+1}号的阵营为${campLabel(info.camp)}。`,'link');}
    consume(r,get(r,link.from),'lagrange');
  }else addLog(r,'公开连线未完成，未消耗公式卡。');
  r.pending=link.resume;delete r.link;r.turnId=id();r.pending.deadline=now+15000;
}
function consume(r,p,card){p.cards.splice(p.cards.indexOf(card),1);r.used.push(card);addLog(r,`${p.seat+1}号使用了${FORMULAS[card].name}。`,'formula',p.id,{card});}
function useFormula(r,p,a,now){
  const card=a.card;requireThat(p.alive,'出局者不能使用公式');requireThat(p.cards.includes(card),'没有这张公式卡');requireThat(!r.used.includes(card),'本日同一种公式只能生效一次');
  requireThat(['day','vote','reaction'].includes(r.phase)&&!r.link,'只能在白天合适时机使用公式');
  if(card==='fourier'){
    requireThat(r.phase==='reaction'&&r.voteResult,'需要公投锁定且有唯一最高票');
    const original=r.voteResult;r.protected=[...(r.protected||[]),original];r.voteResult=tally(r.votes,r.protected);consume(r,p,card);finalizeVote(r,now);return;
  }
  requireThat(r.phase==='day'&&r.pending?.kind!=='lastwords','这张公式需在公投前的发言阶段使用');
  if(card==='hopital'){consume(r,p,card);r.skipVote=true;return;}
  const t=get(r,a.target);requireThat(t.id!==p.id,'不能指定自己');
  if(card==='riemann'){requireThat(!t.alive,'黎曼积分需要指定已出局玩家');r.extended.push({pid:t.id,round:r.round+1});consume(r,p,card);return;}
  requireThat(t.alive,'目标已出局');
  if(card==='taylor'){privateInfo(r,p.id,t.id,'taylor');consume(r,p,card);return;}
  if(card==='cauchy'){r.blocked.push(t.id);consume(r,p,card);return;}
  if(card==='lagrange'){
    r.link={from:p.id,to:t.id,selections:{},resume:clone(r.pending)};pending(r,'link',[p.id,t.id],now);addLog(r,`${p.seat+1}号邀请${t.seat+1}号公开连线，请双方选择可验证信息。`,'link_invite',p.id,{target:t.id});return;
  }
  fail('未知公式卡');
}
export function act(r,pid,a,now=Date.now()){
  const p=get(r,pid);requireThat(a&&typeof a.type==='string','动作格式不正确');
  if(a.type==='start'){startGame(r,pid,{now});return;}
  requireThat(!['waiting','ended'].includes(r.phase),'当前不能执行这个动作');
  if(a.type==='formula'){useFormula(r,p,a,now);return;}
  if(a.type==='explode'){
    requireThat(p.alive&&p.role==='outlier'&&r.phase==='day'&&!r.link,'当前不能自爆');
    addLog(r,`${p.seat+1}号异常值自爆，完成出局环节后进入下一夜。`);startDeaths(r,[pid],'explode','night',now);return;
  }
  const t=r.pending;requireThat(t?.actors.includes(pid),'当前没有轮到你');requireThat(!t.submitted?.[pid],'你已提交，请等待其他玩家');
  requireThat(p.alive||['hunter','quiz','lastwords'].includes(t.kind),'出局者不能执行这个动作');
  if(a.type==='endSpeech'){requireThat(['speech','lastwords'].includes(t.kind),'当前不是发言阶段');complete(r,pid,now);return;}
  if(a.type==='speak'){
    requireThat(['speech','lastwords'].includes(t.kind),'当前不是发言阶段');
    const text=String(a.text||'').trim();requireThat(text.length>0&&text.length<=800,'请输入1至800字的发言');
    addLog(r,text,'chat',pid,{audioId:a.audioId||null});if(a.finish)complete(r,pid,now);return;
  }
  requireThat(a.type===t.kind,'动作与当前阶段不匹配');
  const target=a.target==null?null:get(r,a.target);
  if(['kill','guard','check','hunter','absorb','vote'].includes(t.kind)&&target){
    if(t.kind==='absorb')requireThat(r.night.deaths.includes(target.id)&&target.id!==pid,'只能吞噬本夜其他出局者');
    else requireThat(target.alive,'目标已出局');
    if(['guard','check','hunter','vote'].includes(t.kind))requireThat(target.id!==pid,'不能选择自己');
    if(t.kind==='vote')requireThat(!r.blocked.includes(target.id)&&!(r.protected||[]).includes(target.id),'该玩家本日不能被投票');
  }
  switch(t.kind){
    case 'kill':r.night.killVotes[pid]=target?.id||null;break;
    case 'guard':r.night.guard=target?.id||null;break;
    case 'check':if(target)privateInfo(r,pid,target.id,'regression');break;
    case 'witch':{
      if(a.heal){requireThat(p.heal&&r.night.kill,'没有可使用的置信药');requireThat(r.night.kill!==pid,'置信药不能自救');}
      if(a.poison){const victim=get(r,a.poison);requireThat(victim.alive&&victim.id!==pid&&p.poison,'毒药目标或次数不合法');}
      r.night.heal=!!a.heal;r.night.poison=a.poison||null;break;
    }
    case 'absorb':if(target)privateInfo(r,pid,target.id,'svd');break;
    case 'hunter':if(target){r.deathFlow.queue.push(target.id);r.deathFlow.hunterTargets||=[];r.deathFlow.hunterTargets.push(target.id);}break;
    case 'vote':requireThat(!r.blocked.includes(pid),'本日你不能投票');r.votes[pid]=target?.id||null;break;
    case 'reaction':break;
    case 'quiz':{
      const q=t.question,answer=String(a.answer??''),correct=answer===q.answer;
      requireThat(answer===''||q.options.includes(answer),'请选择题目提供的选项');
      if(correct)p.badge+=q.category==='pro'?2:1;
      addLog(r,`${p.seat+1}号${correct?'答对了':'未答对'}：${q.stem} 正确答案：${q.answer}。`,'answer',pid,{correct,questionId:q.id});
      r.lastAnswer={player:pid,stem:q.stem,answer:q.answer,correct};break;
    }
    case 'link':{
      if(a.decline){finishLink(r,now,false);return;}
      const info=a.infoId==='self'?{target:pid,camp:camp(p)}:p.info.find(i=>i.id===a.infoId);
      requireThat(info,'请选择一条真实信息');r.link.selections[pid]={target:info.target,camp:info.camp};break;
    }
    default:fail('未知动作');
  }
  complete(r,pid,now);
}
function complete(r,pid,now){r.pending.submitted||={};r.pending.submitted[pid]=true;if(r.pending.actors.every(x=>r.pending.submitted[x]))advance(r,now);}
function advance(r,now){
  const kind=r.pending.kind;
  switch(kind){
    case 'kill':{
      const v=r.night.killVotes,counts={};Object.values(v).filter(Boolean).forEach(x=>counts[x]=(counts[x]||0)+1);
      const max=Math.max(0,...Object.values(counts)),top=Object.keys(counts).filter(x=>counts[x]===max);
      r.night.kill=top.length?top[randomInt(top.length)]:null;nightStep(r,'guard',now);break;
    }
    case 'guard':nightStep(r,'check',now);break;
    case 'check':nightStep(r,'witch',now);break;
    case 'witch':r.night.deaths=resolveNight(r);nightStep(r,'absorb',now);break;
    case 'absorb':{
      const deaths=r.night.deaths;addLog(r,deaths.length?'天亮，夜晚行动已结算。':'天亮了，昨夜平安。');startDeaths(r,deaths,'night','day',now);break;
    }
    case 'hunter':processDeaths(r,now);break;
    case 'quiz':r.phase='lastwords';pending(r,'lastwords',[r.pending.actors[0]],now);break;
    case 'lastwords':if(r.pending.extended){nextSpeech(r,now);}else nextQuiz(r,now);break;
    case 'speech':nextSpeech(r,now);break;
    case 'vote':finishVote(r,now);break;
    case 'reaction':finalizeVote(r,now);break;
    case 'link':finishLink(r,now);break;
    default:fail('阶段无法推进');
  }
}
export function tick(r,now=Date.now()){
  if(!r.pending||r.phase==='ended'||now<r.pending.deadline)return false;
  if(r.pending.kind==='link'){finishLink(r,now,false);return true;}
  // Timing out never fabricates a human choice. A missing vote/action is abstention.
  if(r.pending.kind==='vote')for(const pid of r.pending.actors)if(!r.pending.submitted[pid])r.votes[pid]=null;
  if(r.pending.kind==='quiz'){const pid=r.pending.actors[0];act(r,pid,{type:'quiz',answer:''},now);}
  else advance(r,now);
  return true;
}
export function campLabel(c){return {justice:'正义',evil:'异常',neutral:'混沌'}[c]||'未知';}
export function view(r,pid){
  const me=get(r,pid),ended=r.phase==='ended',t=r.pending;
  const mine=!!t?.actors.includes(pid)&&!t.submitted?.[pid];
  const players=r.players.map(p=>({id:p.id,name:p.name,seat:p.seat,bot:p.bot,alive:p.alive,badge:p.badge,flipped:!!p.flipped,...(ended||p.id===pid||p.flipped?{role:p.role}:{}),blocked:r.blocked.includes(p.id)}));
  const pendingView=t?{myTurn:mine}:null;
  // All non-acting players receive one generic night screen. In particular do not
  // leak a role-specific timer or a changing internal step identifier.
  if(t&&(r.phase!=='night'||mine)){
    pendingView.kind=t.kind;pendingView.deadline=t.deadline;
    if(r.phase!=='night')pendingView.speakers=t.actors;
    if(mine){
      pendingView.action=t.kind;
      let choices=alive(r).filter(p=>p.id!==pid).map(p=>p.id);
      if(t.kind==='kill')choices=alive(r).map(p=>p.id);
      if(t.kind==='absorb')choices=r.night.deaths.filter(x=>x!==pid);
      if(t.kind==='vote')choices=choices.filter(x=>!r.blocked.includes(x)&&!(r.protected||[]).includes(x));
      pendingView.choices=choices;
      if(t.kind==='witch')pendingView.victim=r.night.kill;
      if(t.kind==='quiz'){const {answer,...q}=t.question;pendingView.question=clone(q);}
      if(t.kind==='link')pendingView.information=[{id:'self',target:pid,camp:camp(me),source:'self'},...clone(me.info)];
    }
  }
  return {code:r.code,hostId:r.hostId,size:r.size,pro:r.pro,phase:r.phase,round:r.round,revision:r.revision,rulesVersion:r.rulesVersion,
    players,me:{id:me.id,name:me.name,seat:me.seat,alive:me.alive,role:me.role,camp:camp(me),cards:clone(me.cards),info:clone(me.info),badge:me.badge,heal:me.heal,poison:me.poison},
    teammates:me.role==='outlier'?r.players.filter(p=>p.role==='outlier'&&p.id!==pid).map(p=>p.id):[],
    log:clone(r.log.slice(-180)),pending:pendingView,used:[...r.used],result:r.result,
    votes:['reaction','ended'].includes(r.phase)?clone(r.votes):{},lastAnswer:r.lastAnswer||null,
    turnId:r.phase==='night'&&!mine?'night-'+r.round:r.turnId};
}
