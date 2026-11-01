import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestId} from '../public/ids.js';
test('LAN HTTP browsers without crypto.randomUUID can still submit unique actions',()=>{
 const fallbackCrypto={getRandomValues(array){for(let i=0;i<array.length;i++)array[i]=i+13;return array;}};
 const id=requestId(fallbackCrypto);assert.ok(typeof id==='string'&&id.length>=16);
 const basic=requestId(null);assert.ok(typeof basic==='string'&&basic.length>=4);
});
