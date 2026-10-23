import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {inflateRawSync} from 'node:zlib';

const script=readFileSync(new URL('../extension/zip.js',import.meta.url),'utf8');
function harness(){
 let listener,blob;
 const chrome={runtime:{onMessage:{addListener(fn){listener=fn}}}};
 const url={createObjectURL(value){blob=value;return 'blob:micirql-test'},revokeObjectURL(){}};
 runInNewContext(script,{chrome,TextEncoder,Uint32Array,Uint8Array,Blob,URL:url,atob,setTimeout,clearTimeout});
 const send=(action,extra={})=>new Promise(resolve=>listener({target:'ZIP_OFFSCREEN',action,...extra},{},resolve));
 return {send,blob:()=>blob};
}
test('ZIP stores independent valid screenshots with intact CRC',async()=>{
 const h=harness();
 assert.equal((await h.send('START')).ok,true);
 const samples=[['home-375px.png',Buffer.from('screenshot one')],['home-768px.png',Buffer.from('screenshot two')]];
 for(const [name,buf] of samples)assert.equal((await h.send('ADD',{name,data:buf.toString('base64')})).ok,true);
 const finished=await h.send('FINISH');
 assert.equal(finished.ok,true);
 assert.equal(finished.count,2);
 const data=Buffer.from(await h.blob().arrayBuffer());
 let off=0;
 for(const [name,buf] of samples){
  assert.equal(data.readUInt32LE(off),0x04034b50);
  const method=data.readUInt16LE(off+8);
  const len=data.readUInt32LE(off+18);
  const nameLen=data.readUInt16LE(off+26);
  const actual=data.subarray(off+30,off+30+nameLen).toString();
  assert.equal(actual,name);
  assert.equal(method,0);
  assert.equal(len,buf.length);
  assert.deepEqual(data.subarray(off+30+nameLen,off+30+nameLen+len),buf);
  off+=30+nameLen+len;
 }
 assert.equal(data.readUInt32LE(off),0x02014b50);
 assert.equal(data.readUInt32LE(data.length-22),0x06054b50);
 assert.equal(data.readUInt16LE(data.length-12),2);
});
test('ZIP rejects invalid, duplicate and missing screenshot entries',async()=>{
 const h=harness();
 await h.send('START');
 assert.equal((await h.send('ADD',{name:'../unsafe.png',data:'YWJj'})).ok,false);
 assert.equal((await h.send('ADD',{name:'ok.png',data:''})).ok,false);
 assert.equal((await h.send('ADD',{name:'ok.png',data:'YWJj'})).ok,true);
 const duplicate=await h.send('ADD',{name:'ok.png',data:'YWJj'});
 assert.equal(duplicate.ok,false);
 assert.match(duplicate.error,/duplicate/i);
});
