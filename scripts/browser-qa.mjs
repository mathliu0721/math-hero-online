// Optional author QA. Uses the bundled Playwright runtime or PLAYWRIGHT_PACKAGE.
// No provider key or real paid voice request is used. Not a WeChat device test.
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from '../server/http.mjs';
import {view} from '../server/game.mjs';
const require=createRequire(import.meta.url);
const bundle=process.env.PLAYWRIGHT_PACKAGE||join(process.env.USERPROFILE||'', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(bundle);
const {fileURLToPath}=await import('node:url');
const project=fileURLToPath(new URL('../',import.meta.url));
const outputs=join(project,'outputs');await mkdir(outputs,{recursive:true});
const server=await createServer({dataDir:join(outputs,'browser-qa-data'),auto:false,config:{}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const executable=process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:executable});
 const a=await browser.newContext({viewport:{width:1440,height:1000}}),b=await browser.newContext({viewport:{width:390,height:844}});
 await a.addInitScript(()=>Object.defineProperty(crypto,'randomUUID',{value:undefined}));
 const pages=[await a.newPage(),await b.newPage()],errors=[];
 for(const p of pages)p.on('pageerror',e=>errors.push(e.message));
 await pages[0].goto(base);await pages[0].locator('#name').fill('网页验收');
 await pages[0].screenshot({path:join(outputs,'home-desktop.png'),fullPage:true});
 await pages[0].locator('[data-do=create]').click();await pages[0].waitForSelector('.room-code');const code=await pages[0].locator('.room-code').textContent();
 await pages[1].goto(base+'/?room='+code);await pages[1].locator('#name').fill('手机验收');await pages[1].locator('[data-do=join]').click();await pages[1].waitForSelector('.room-code');
 await pages[0].waitForTimeout(850);await pages[0].locator('[data-do=start]').click();
 await pages[0].waitForSelector('.identity-image');
 const ids=await Promise.all(pages.map(p=>p.evaluate(async()=>{const s=JSON.parse(sessionStorage.getItem('shumoxia-session'));return (await(await fetch('/api/rooms/'+s.code+'/state',{headers:{Authorization:'Bearer '+s.token}})).json()).state.me.id;})));
 let humanActions=0,botActions=0,capturedDay=false;const phases=new Set();
 for(let i=0;i<700;i++){
  const room=server.application.store.rooms.get(code).room;phases.add(room.phase);
  if(room.phase==='ended')break;
  const actor=room.pending.actors.find(x=>!room.pending.submitted?.[x]),human=ids.indexOf(actor);
  if(human<0){await server.application.pump(code,{immediate:true});botActions++;continue;}
  const p=pages[human];await p.waitForTimeout(850);const personal=view(server.application.store.rooms.get(code).room,actor),kind=personal.pending.action;
  if(!capturedDay&&room.phase==='day'){await pages[0].screenshot({path:join(outputs,'room-day-desktop.png'),fullPage:true});capturedDay=true;}
  if(['speech','lastwords'].includes(kind)){
   await p.locator('#chat').fill('我会结合公开信息判断，先听完大家的依据。');await p.locator('[data-do=send]').click();await p.waitForTimeout(50);await p.locator('[data-do=end-speech]').click();
  }else if(kind==='quiz')await p.locator('[data-answer]').first().click();
  else if(kind==='witch')await p.locator('[data-do=witch]').click();
  else if(kind==='reaction')await p.locator('[data-do=skip]').click();
  else if(kind==='link')await p.locator('[data-info]').first().click();
  else if(personal.pending.choices?.length){await p.locator(`[data-seat="${personal.pending.choices[0]}"]`).click();await p.locator('[data-do=target-submit]').click();}
  else await p.locator('[data-do=skip]').click();
  humanActions++;
 }
 const final=server.application.store.rooms.get(code).room;
 if(final.phase!=='ended')throw new Error('浏览器实玩未结束');
 await pages[0].waitForTimeout(900);await pages[1].waitForTimeout(100);
 for(const [i,p]of pages.entries()){await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:join(outputs,i===0?'room-result-desktop.png':'room-result-mobile.png'),fullPage:true});}
 const overflow=await pages[1].evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(errors.length||overflow)throw new Error(JSON.stringify({errors,overflow}));
 const result={passed:true,room:code,rounds:final.round,winner:final.result,humanActions,botActions,phases:[...phases],pageErrors:errors,mobileHorizontalOverflow:overflow,mode:'rule bots; real browser buttons; simulated fast bot scheduling; no paid providers or WeChat device'};
 await writeFile(join(outputs,'browser-qa-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
