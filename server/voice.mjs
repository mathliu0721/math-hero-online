export function pcmToWav(pcm){
 if(!pcm.length||pcm.length>16000*2*60||pcm.length%2)throw new Error('录音需为16kHz单声道16位PCM，最长60秒');
 const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(16000,24);h.writeUInt32LE(32000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);
}
export function validateWav(wav){
 if(wav.length<44||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('请上传PCM WAV录音');
 if(wav.readUInt16LE(20)!==1||wav.readUInt16LE(22)!==1||wav.readUInt32LE(24)!==16000||wav.readUInt16LE(34)!==16||wav.toString('ascii',36,40)!=='data'||wav.readUInt32LE(40)!==wav.length-44)throw new Error('录音格式必须为16kHz单声道16位PCM WAV');
 const seconds=(wav.length-44)/32000;if(seconds<=0||seconds>60)throw new Error('录音最长60秒');return seconds;
}
export async function transcribe(wav,config,budget){
 const seconds=validateWav(wav);if(!config.key)throw new Error('语音识别尚未配置，请先使用文字发言');
 const held=budget.reserve(seconds/60*config.asrPrice);
 try{
  const form=new FormData();form.append('model',config.asrModel);form.append('file',new Blob([wav],{type:'audio/wav'}),'recording.wav');
  const r=await fetch(config.base.replace(/\/$/,'')+'/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+config.key},body:form,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error('语音识别服务返回'+r.status);const d=await r.json();if(typeof d.text!=='string')throw new Error('识别结果无效');budget.settle(held,seconds/60*config.asrPrice);return d.text.slice(0,800);
 }catch(e){budget.settle(held,NaN);throw e;}
}
export async function synthesize(text,config,budget){
 if(!config.key)throw new Error('语音合成尚未配置');
 const held=budget.reserve(text.length/1000*config.ttsPrice);
 try{
  const r=await fetch(config.base.replace(/\/$/,'')+'/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify({model:config.ttsModel,input:text,voice:config.ttsVoice,response_format:'mp3',sample_rate:32000}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error('语音合成服务返回'+r.status);const audio=Buffer.from(await r.arrayBuffer());budget.settle(held,text.length/1000*config.ttsPrice);return audio;
 }catch(e){budget.settle(held,NaN);throw e;}
}
