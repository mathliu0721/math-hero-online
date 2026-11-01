/* Shared REST transport, packaged as ordinary .js for the WeChat loader. */
function createClient(wx,config){
 const base=config.backendUrl.replace(/\/$/,'');
 let session=wx.getStorageSync('shumoxia-session')||null,state=null,services={};
 const call=(path,method='GET',data,contentType='application/json')=>new Promise((resolve,reject)=>wx.request({url:base+'/api'+path,method,data,header:{'Content-Type':contentType,...(session?.token?{Authorization:'Bearer '+session.token}:{})},timeout:25000,success:r=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(new Error(r.data?.error||'请求失败 '+r.statusCode)),fail:e=>reject(new Error(e.errMsg||'网络暂时不可用'))}));
 function accept(d){if(d.token){session={code:d.state.code,token:d.token};wx.setStorageSync('shumoxia-session',session);}if(d.state)state=d.state;if(d.services)services=d.services;return d;}
 return {
  get state(){return state;},get services(){return services;},get session(){return session;},get base(){return base;},
  async create(name,size,pro){return accept(await call('/rooms','POST',{name,size,pro}));},
  async join(code,name){return accept(await call(`/rooms/${code}/join`,'POST',{name}));},
  async refresh(){if(!session)return null;return accept(await call(`/rooms/${session.code}/state`));},
  async health(){const d=await call('/health');services=d;return d;},
  async act(a){if(!state)throw new Error('请先进入房间');const d=await call(`/rooms/${state.code}/action`,'POST',{...a,revision:state.revision,actionId:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)});return accept(d);},
  async transcribe(pcm){return call(`/rooms/${state.code}/audio`,'POST',pcm,'audio/pcm');},
  async speech(messageId){return call(`/rooms/${state.code}/tts`,'POST',{messageId});},
  async downloadAudio(audioId){return new Promise((resolve,reject)=>wx.downloadFile({url:base+`/api/rooms/${state.code}/audio/${audioId}`,header:{Authorization:'Bearer '+session.token},success:r=>r.statusCode===200?resolve(r.tempFilePath):reject(new Error('音频暂不可用')),fail:reject}));},
  clear(){session=null;state=null;wx.setStorageSync('shumoxia-session',null);}
 };
}
module.exports={createClient};
