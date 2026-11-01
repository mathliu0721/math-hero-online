export function requestId(cryptoApi=globalThis.crypto){
 if(typeof cryptoApi?.randomUUID==='function')return cryptoApi.randomUUID();
 if(typeof cryptoApi?.getRandomValues==='function')return [...cryptoApi.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
 return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
}
