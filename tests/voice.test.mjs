import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pcmToWav,validateWav} from '../server/voice.mjs';
test('audio duration is calculated from verified PCM rather than a client-declared duration',()=>{
 const wav=pcmToWav(Buffer.alloc(32000));assert.equal(validateWav(wav),1);
 assert.throws(()=>pcmToWav(Buffer.alloc(32000*61)),/60秒/);
 const bad=Buffer.from(wav);bad.writeUInt32LE(8000,24);assert.throws(()=>validateWav(bad),/16kHz/);
});
