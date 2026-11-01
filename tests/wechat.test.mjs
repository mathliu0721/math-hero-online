import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('WeChat transport uses the same authenticated revisioned REST contract',async()=>{
 const {createClient}=require('../wechat/client.js');
 const calls=[],saved={};const wx={getStorageSync:k=>saved[k],setStorageSync:(k,v)=>saved[k]=v,request(o){calls.push(o);o.success({statusCode:200,data:{token:'server-token',state:{code:'123456',revision:7,me:{id:'wx-seat'}}}});}};
 const c=createClient(wx,{backendUrl:'https://example.test'});
 await c.join('123456','微信玩家');await c.act({type:'vote',target:'another-seat'});
 assert.equal(calls[0].url,'https://example.test/api/rooms/123456/join');
 assert.equal(calls[1].header.Authorization,'Bearer server-token');assert.equal(calls[1].data.revision,7);
 assert.equal(calls[1].data.playerId,undefined);assert.ok(calls[1].data.actionId);
});
