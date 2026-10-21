import test from 'node:test';
import assert from 'node:assert/strict';
import {readJsonLimited,PayloadTooLargeError} from '../src/request-limits.js';

test('parses a bounded JSON body',async()=>{
 const req=new Request('https://example.com',{method:'POST',body:JSON.stringify({ok:true})});
 assert.deepEqual(await readJsonLimited(req,100),{ok:true});
});
test('rejects a body larger than limit without relying on content-length',async()=>{
 const req=new Request('https://example.com',{method:'POST',body:' '.repeat(300)});
 await assert.rejects(readJsonLimited(req,100),PayloadTooLargeError);
});
test('rejects invalid JSON',async()=>{
 const req=new Request('https://example.com',{method:'POST',body:'{invalid'});
 await assert.rejects(readJsonLimited(req,100),SyntaxError);
});
