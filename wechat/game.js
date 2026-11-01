/* Native WeChat mini-game Canvas client. Shares the exact REST room with web. */
const {createClient}=require('./client.js');
const config=require('./config.js');
const client=createClient(wx,config);
const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();
const canvas=wx.createCanvas(),ctx=canvas.getContext('2d');
let W=info.windowWidth,H=info.windowHeight,DPR=Math.min(2,info.pixelRatio||1);
canvas.width=W*DPR;canvas.height=H*DPR;ctx.scale(DPR,DPR);
const C={paper:'#f5f3ee',white:'#fffefb',ink:'#283b47',muted:'#829084',deep:'#233b4b',green:'#526f60',line:'#dee5da',pale:'#e8eee4'};
const roles={regression:'回归分析',confidence:'置信区间',anova:'方差分析',bayes:'贝叶斯定理',fool:'大数定律',outlier:'异常值',svd:'奇异值分解',normal:'正态分布'};
const formula={hopital:'洛必达法则',taylor:'泰勒展开',lagrange:'拉格朗日中值定理',fourier:'傅里叶变换',cauchy:'柯西收敛准则',riemann:'黎曼积分'};
const formulasText={hopital:'白天公投前跳过本次公投。',taylor:'私下查验任意另一名存活玩家的阵营。',lagrange:'双方各选择一条真实信息，确认后一起公开；拒绝不扣牌。',fourier:'投票锁定后改变淘汰目标，唯一最高票免死，由次高票替代。',cauchy:'指定一名玩家，本日不能投票也不能被投票。',riemann:'指定一位已出局玩家，下轮白天再获得一次遗言。'};
const phases={waiting:'等待入座',night:'夜晚观测',day:'白天讨论',vote:'匿名公投',reaction:'公式反应',elimination:'出局结算',quiz:'遗言答题',lastwords:'最后发言',ended:'对局结束'};
const camps={justice:'正义',evil:'异常',neutral:'混沌'};
const symbols=['α','β','π','Σ','λ','ε','μ','φ','δ','σ','θ','ω','∫','η','γ','ξ'];
let screen='home',offset=0,maxScroll=0,targets=[],selected=null,size=8,pro=false,busy=false,recording=false,name=wx.getStorageSync('shumoxia-name')||'建模玩家',status='连接牌桌中…',touchStart=null,lastTouch=null;
const images={};
function art(key){if(images[key])return images[key];const img=wx.createImage();img.onload=()=>draw();img.src='assets/'+key+'.png';images[key]=img;return img;}
function text(value,x,y,size=13,color=C.ink,font='sans-serif'){ctx.fillStyle=color;ctx.font=size+'px '+font;ctx.textBaseline='top';ctx.fillText(String(value),x,y);}
function wrap(value,x,y,width,size=12,color=C.ink,maxLines=100){
 ctx.font=size+'px sans-serif';const lines=[];let line='';for(const ch of String(value)){if(ch==='\n'){lines.push(line);line='';continue;}if(ctx.measureText(line+ch).width>width&&line){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);
 for(let i=0;i<Math.min(maxLines,lines.length);i++)text(lines[i]+(i===maxLines-1&&lines.length>maxLines?'…':''),x,y+i*(size+7),size,color);return Math.min(maxLines,lines.length)*(size+7);
}
function box(x,y,w,h,fill=C.white,border=C.line,r=8){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(border){ctx.strokeStyle=border;ctx.lineWidth=1;ctx.stroke();}}
function button(label,x,y,w,h,fn,primary=false,disabled=false){box(x,y,w,h,disabled?'#e8ebe5':primary?C.deep:C.white);ctx.font='12px sans-serif';const tw=ctx.measureText(label).width;text(label,x+(w-tw)/2,y+(h-12)/2,12,disabled?'#a3ada1':primary?C.white:C.ink);if(!disabled)targets.push({x,y,w,h,fn});}
function notify(value){wx.showToast({title:String(value).slice(0,60),icon:'none',duration:2600});}
async function run(fn){if(busy)return;busy=true;draw();try{await fn();status='已同步';}catch(e){notify(e.message||e.errMsg||'暂时无法完成');status=e.message||'正在重连';try{await client.refresh();}catch{}}finally{busy=false;draw();}}
function ask(title,placeholder,value=''){return new Promise(resolve=>wx.showModal({title,editable:true,placeholderText:placeholder,content:value,success:r=>resolve(r.confirm?r.content:null),fail:()=>resolve(null)}));}
function showHome(y){
 text('THE TABLE IS YOURS',20,y,10,C.muted);y+=27;text('让推理，发生在牌桌上。',20,y,22);y+=45;
 text('同一副卡牌，另一种相聚的方式。',20,y,12,C.muted);y+=35;
 const cardW=85,cardH=119,startX=W/2-105;
 for(const [i,key] of ['outlier','regression','bayes'].entries()){const image=art(key);if(image.width)ctx.drawImage(image,startX+i*62,y+(i===1?0:12),cardW,cardH);}
 y+=150;box(16,y,W-32,310);y+=19;text('准备好你的第一场推理',31,y,17);y+=34;
 button('昵称：'+name,30,y,W-60,42,()=>run(async()=>{const n=await ask('牌桌上的名字','最多16字',name);if(n?.trim()){name=n.trim().slice(0,16);wx.setStorageSync('shumoxia-name',name);}}));y+=61;
 text('选择牌桌人数',31,y,12,C.muted);y+=26;const bw=(W-76)/5;
 [8,10,12,14,16].forEach((n,i)=>button(n+'人',30+i*(bw+4),y,bw,41,()=>{size=n;draw();},size===n));y+=57;
 button((pro?'☑':'□')+' 加入专业挑战题库',30,y,W-60,37,()=>{pro=!pro;draw();});y+=52;
 button('创建房间',30,y,(W-70)/2,45,()=>run(async()=>{await client.create(name,size,pro);screen='room';offset=0;}),true,busy);
 button('加入朋友',40+(W-70)/2,y,(W-70)/2,45,()=>run(async()=>{const code=await ask('加入朋友的房间','请输入六位房间号');if(code&&/^\d{6}$/.test(code)){await client.join(code,name);screen='room';offset=0;}else if(code)notify('请输入六位房间号');}));y+=75;
 y+=wrap('身份推理 · 公式博弈 · 出局答题\n使用与网页相同的房间号，和朋友、AI 一起完成一局。',23,y,W-46,11,C.muted);
 if(client.session){y+=18;button('返回上次房间',23,y,W-46,42,()=>run(async()=>{await client.refresh();screen='room';offset=0;}));y+=56;}
 return y;
}
function sendAction(a){return run(async()=>{await client.act(a);selected=null;});}
function actionPanel(y){
 const r=client.state,p=r.pending,my=p?.myTurn,kind=p?.action;
 text(my?'YOUR TURN':'OBSERVATION',20,y,10,C.muted);y+=25;
 if(r.phase==='waiting'){
  y+=wrap('邀请朋友入座，开局时由 AI 补齐其余位置。',20,y,W-40,13);y+=10;
  button('分享房间号 '+r.code,20,y,W-40,42,()=>wx.shareAppMessage({title:'来一局数模侠 · 房间'+r.code,query:'room='+r.code}));y+=55;
  if(r.hostId===r.me.id){button('用 AI 补齐并开局',20,y,W-40,45,()=>sendAction({type:'start'}),true,busy);y+=60;}else{text('等待房主开局',20,y,12,C.muted);y+=35;}return y;
 }
 if(r.phase==='ended'){
  text(camps[r.result]+'阵营获胜',20,y,22,C.green);y+=43;
  button('再开一场',20,y,W-40,45,()=>{client.clear();screen='home';offset=0;draw();},true);return y+65;
 }
 if(!my){y+=wrap(r.phase==='night'?'夜间行动仅向对应角色开放。轮到你时会出现提示。':!r.me.alive?'你已出局，可继续观看公开记录。':'请等待当前玩家完成行动。',20,y,W-40,12,C.muted);return y+24;}
 const labels={kill:'选择剔除目标',guard:'选择守护对象',check:'选择查验对象',witch:'本夜用药',absorb:'选择吞噬对象',hunter:'选择带走的玩家',vote:'投下你的判断',speech:'轮到你发言',lastwords:'最后的线索',quiz:'一道题，为遗言赢得徽章',reaction:'公投已锁定，可使用傅里叶变换',link:'选择一条真实信息公开'};
 text(labels[kind]||kind,20,y,16);y+=30;
 if(p.deadline){text('剩余 '+Math.max(0,Math.ceil((p.deadline-Date.now())/1000))+' 秒',20,y,11,C.muted);y+=28;}
 if(['kill','guard','check','absorb','hunter','vote'].includes(kind)){
  const target=r.players.find(x=>x.id===selected);y+=wrap(target?'已选 '+(target.seat+1)+'号 '+target.name:'点击上方座位选择目标。',20,y,W-40,12,C.green);y+=10;
  button('确认选择',20,y,(W-50)/2,43,()=>sendAction({type:kind,target:selected}),true,!selected||!p.choices.includes(selected)||busy);
  button(kind==='vote'?'弃票':'跳过',30+(W-50)/2,y,(W-50)/2,43,()=>sendAction({type:kind,target:null}),false,busy);y+=61;
 }else if(kind==='witch'){
  const victim=r.players.find(x=>x.id===p.victim);y+=wrap(victim?'被攻击的是 '+(victim.seat+1)+'号 '+victim.name:'本夜没有剔除目标',20,y,W-40,12);y+=12;
  button('使用置信药救人',20,y,W-40,42,()=>sendAction({type:'witch',heal:true,poison:null}),true,!r.me.heal||!p.victim||p.victim===r.me.id||busy);y+=53;
  button('对选中座位使用区间药',20,y,W-40,42,()=>sendAction({type:'witch',heal:false,poison:selected}),false,!r.me.poison||!selected||selected===r.me.id||busy);y+=53;
  button('两种药同时使用',20,y,W-40,42,()=>sendAction({type:'witch',heal:true,poison:selected}),false,!r.me.heal||!r.me.poison||!p.victim||p.victim===r.me.id||!selected||selected===r.me.id||busy);y+=53;
  button('本夜不用药',20,y,W-40,42,()=>sendAction({type:'witch',heal:false,poison:null}),false,busy);y+=57;
 }else if(['speech','lastwords'].includes(kind)){
  button('文字发言',20,y,(W-50)/2,43,()=>run(async()=>{const value=await ask('分享你的线索','最多800字');if(value?.trim())await client.act({type:'speak',text:value.trim().slice(0,800)});}),true,busy);
  button(recording?'结束录音':'语音发言',30+(W-50)/2,y,(W-50)/2,43,record,false,busy);y+=55;
  button('结束我的发言',20,y,W-40,40,()=>sendAction({type:'endSpeech'}),false,busy);y+=56;
 }else if(kind==='quiz'){
  y+=wrap(p.question.stem,20,y,W-40,14);y+=13;
  if(p.question.category==='pro'){y+=wrap('专业题以结论／方法选答，不评判完整证明。',20,y,W-40,10,C.muted);y+=10;}
  p.question.options.forEach((answer,i)=>{const h=Math.max(45,Math.ceil(answer.length/20)*19+17);box(20,y,W-40,h);wrap('ABCD'[i]+' · '+answer,32,y+12,W-64,12,C.ink);targets.push({x:20,y,w:W-40,h,fn:()=>sendAction({type:'quiz',answer})});y+=h+9;});
 }else if(kind==='reaction'){
  button('使用傅里叶变换',20,y,W-40,43,()=>useFormula('fourier'),true,busy);y+=54;
  button('放弃反应',20,y,W-40,42,()=>sendAction({type:'reaction'}));y+=58;
 }else if(kind==='link'){
  for(const item of p.information){const h=45,label=(item.id==='self'?'公开我自己':`公开 ${r.players.find(x=>x.id===item.target).seat+1}号`)+': '+camps[item.camp];button(label,20,y,W-40,h,()=>sendAction({type:'link',infoId:item.id}));y+=h+8;}
  button('拒绝连线',20,y,W-40,42,()=>sendAction({type:'link',decline:true}));y+=58;
 }
 return y;
}
function useFormula(key){
 const r=client.state;if(!r||!r.me.cards.includes(key))return;
 const target=r.players.find(x=>x.id===selected);
 if(!['hopital','fourier'].includes(key)&&!target){notify('先点击要指定的座位，再点公式卡');return;}
 wx.showModal({title:formula[key],content:formulasText[key]+(target?` 当前选择：${target.seat+1}号${target.name}。`:'')+' 使用后弃置。',success:res=>{if(res.confirm)void sendAction({type:'formula',card:key,target:selected});}});
}
function showRoom(y){
 const r=client.state;if(!r)return y;const role=roles[r.me.role];
 text('房间 '+r.code,20,y,19);text(`${r.size}人局 · 第${r.round}轮`,W-139,y+4,11,C.muted);y+=35;
 text(phases[r.phase],20,y,12,C.green);text('● '+status,W-130,y,10,C.muted);y+=30;
 box(16,y,W-32,role?144:70);
 if(role){const image=art(r.me.role);if(image.width)ctx.drawImage(image,26,y+10,87,122);text('仅自己可见',127,y+14,10,C.muted);text(role,127,y+37,18);text(camps[r.me.camp]+'阵营 · π × '+r.me.badge,127,y+68,12,C.green);text(r.me.alive?'存活中':'已出局',127,y+96,11,C.muted);y+=159;}
 else{wrap('开局后随机发放身份与公式卡。\n分享房间号，邀请你的同伴。',28,y+16,W-56,12,C.muted);y+=85;}
 for(const key of r.me.cards){button('公式卡 · '+formula[key],20,y,W-40,41,()=>useFormula(key));y+=51;}
 if(r.me.info.length||r.teammates.length){
  const clues=r.me.info.map(i=>`${i.seat+1}号：${camps[i.camp]}`).join(' / '),mates=r.teammates.map(pid=>`${r.players.find(p=>p.id===pid).seat+1}号`).join('、');
  y+=wrap((mates?'异常同伴 '+mates+'\n':'')+clues,20,y,W-40,11,C.green);y+=15;
 }
 const sw=(W-52)/4,sh=86;box(16,y,W-32,Math.ceil(r.size/4)*(sh+8)+22,C.pale);y+=12;
 for(let i=0;i<r.size;i++){
  const p=r.players[i],x=23+(i%4)*(sw+2),sy=y+Math.floor(i/4)*(sh+8);
  box(x,sy,sw-4,sh,p?.id===selected?'#d4e2d0':p&&!p.alive?'#dfe4dc':C.white,p?.id===r.me.id?C.green:C.line,6);
  text(String(i+1).padStart(2,'0'),x+7,sy+6,9,C.muted);text(p?.bot?'AI':'',x+sw-24,sy+6,8,C.muted);
  text(p?symbols[i]:'+',x+sw/2-12,sy+23,24,C.green,'serif');
  wrap(p?p.name:'等待入座',x+6,sy+54,sw-15,10,C.ink,1);if(p?.role)wrap(roles[p.role],x+5,sy+70,sw-13,8,C.muted,1);
  if(p)targets.push({x,y:sy,w:sw-4,h:sh,fn:()=>{selected=p.id;draw();}});
 }
 y+=Math.ceil(r.size/4)*(sh+8)+26;y=actionPanel(y);
 if(r.me.role==='outlier'&&r.me.alive&&r.phase==='day'){button('公开身份并自爆',20,y,W-40,41,()=>wx.showModal({title:'公开自爆',content:'你将立即出局，完成出局环节后进入黑夜。',success:v=>{if(v.confirm)sendAction({type:'explode'});}}));y+=55;}
 y+=10;text('牌桌记录 · 公开频道',20,y,13);y+=31;
 for(const item of r.log.slice(-35)){
  const p=r.players.find(p=>p.id===item.actor);
  if(item.kind==='chat'){text(p?`${p.seat+1}号 ${p.name}${p.bot?' · AI':''}`:'系统',20,y,10,C.muted);y+=19;const h=wrap(item.text,26,y,W-52,12,C.ink);y+=h+10;button('▷ 播放发言',20,y,112,32,()=>play(item));y+=48;}
  else{y+=wrap(item.text,22,y,W-44,11,item.kind==='death'?'#986967':C.muted);y+=16;}
 }
 return y+25;
}
function draw(){
 ctx.fillStyle=C.paper;ctx.fillRect(0,0,W,H);targets=[];
 ctx.save();ctx.beginPath();ctx.rect(0,72,W,H-72);ctx.clip();ctx.translate(0,-offset);
 const end=screen==='room'?showRoom(94):showHome(99);maxScroll=Math.max(0,end-H+30);offset=Math.max(0,Math.min(offset,maxScroll));ctx.restore();
 ctx.fillStyle=C.paper;ctx.fillRect(0,0,W,72);text('数模侠',20,25,23);text('MATH HERO',111,32,9,C.muted,'serif');
 text(client.services.modelConfigured?'模型 AI 已配置':'规则机器人模式',20,57,9,C.muted);
 button(screen==='home'?'规则':'首页',W-71,21,51,33,()=>{if(screen==='room'){screen='home';offset=0;draw();}else wx.showModal({title:'数模侠玩法',showCancel:false,content:'秘密身份，夜晚技能，白天轮流发言并公投。正义需清除异常与SVD；异常屠光神职或平民；SVD活到残局。出局答题赢徽章，公式改变局势。详见随附规则说明。'});});
 ctx.strokeStyle=C.line;ctx.beginPath();ctx.moveTo(16,71);ctx.lineTo(W-16,71);ctx.stroke();
}
wx.onTouchStart(e=>{const t=e.touches[0];touchStart={x:t.clientX,y:t.clientY,offset};lastTouch=touchStart;});
wx.onTouchMove(e=>{if(!touchStart)return;const t=e.touches[0];lastTouch=t;offset=Math.max(0,Math.min(maxScroll,touchStart.offset+touchStart.y-t.clientY));draw();});
wx.onTouchEnd(e=>{if(!touchStart)return;const t=e.changedTouches[0];if(Math.abs(t.clientY-touchStart.y)<8){const y=t.clientY<72?t.clientY:t.clientY+offset;const target=[...targets].reverse().find(b=>t.clientX>=b.x&&t.clientX<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);target?.fn();}touchStart=null;});
async function play(message){return run(async()=>{let clip=message.audioId;if(!clip){if(!client.services.ttsConfigured){notify('云端语音合成尚未配置，当前可阅读文字');return;}clip=(await client.speech(message.id)).audioId;}const file=await client.downloadAudio(clip);const audio=wx.createInnerAudioContext();audio.src=file;audio.onEnded(()=>audio.destroy());audio.onError(()=>{audio.destroy();notify('音频播放失败');});audio.play();});}
let recorder;
function record(){
 if(recording){recorder.stop();return;}
 if(!client.services.asrConfigured){notify('语音识别尚未配置，请先使用文字');return;}
 if(!wx.getRecorderManager){notify('当前运行环境暂不支持录音');return;}
 recorder=wx.getRecorderManager();recorder.onStop(async result=>{recording=false;await run(async()=>{const pcm=wx.getFileSystemManager().readFileSync(result.tempFilePath);const resultText=await client.transcribe(pcm);const edited=await ask('确认识别文字','检查后发送',resultText.text);if(edited?.trim())await client.act({type:'speak',text:edited.trim().slice(0,800),audioId:resultText.audioId});});});
 recorder.onError(e=>{recording=false;notify(e.errMsg||'无法录音');draw();});
 wx.authorize({scope:'scope.record',success:()=>{recorder.start({duration:55000,sampleRate:16000,numberOfChannels:1,format:'pcm'});recording=true;draw();},fail:()=>notify('请允许麦克风权限后重试')});
}
async function refresh(){try{if(client.session){const old=client.state?.revision;await client.refresh();status='已同步';if(old!==client.state?.revision)draw();}else{await client.health();status=client.services.modelConfigured?'模型AI已配置':'规则机器人模式';draw();}}catch(e){status='正在重连';}}
wx.onShow(async options=>{if(options?.query?.room&&(!client.session||client.session.code!==options.query.room)){const yes=await new Promise(resolve=>wx.showModal({title:'加入房间 '+options.query.room,content:'以 '+name+' 的名字入座？',success:r=>resolve(r.confirm)}));if(yes)await run(async()=>{await client.join(options.query.room,name);screen='room';offset=0;});}else await refresh();});
wx.onHide(()=>{if(recording)recorder?.stop();});
setInterval(refresh,1000);setInterval(draw,1000);draw();void refresh();
