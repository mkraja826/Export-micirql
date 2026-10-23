import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const background=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function harness(initial='in_progress'){
 let onChange;
 let removeCount=0;
 const chrome={
  runtime:{id:'test',onMessage:{addListener(){}}},
  downloads:{
   onChanged:{addListener(fn){onChange=fn},removeListener(fn){if(onChange===fn){onChange=undefined;removeCount++}}},
   async search(){return [{id:44,state:initial}]}
  }
 };
 const context={chrome,URL,Promise,setTimeout,clearTimeout};
 runInNewContext(background+'\nthis.downloadWait=waitForDownload;',context);
 return {wait:()=>context.downloadWait(44,200),emit:change=>onChange?.({id:44,...change}),stats:()=>({removeCount,listening:!!onChange})};
}
test('ZIP progress waits until Chrome reports download complete',async()=>{
 const h=harness();
 let resolved=false;
 const pending=h.wait().then(()=>resolved=true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(resolved,false);
 h.emit({state:{current:'complete'}});
 await pending;
 assert.equal(resolved,true);
 assert.deepEqual(h.stats(),{removeCount:1,listening:false});
});
test('ZIP progress rejects interrupted downloads and removes listener',async()=>{
 const h=harness();
 const pending=h.wait();
 h.emit({state:{current:'interrupted'},error:{current:'NETWORK_FAILED'}});
 await assert.rejects(pending,/NETWORK_FAILED/);
 assert.deepEqual(h.stats(),{removeCount:1,listening:false});
});
test('already-completed download resolves via Chrome search',async()=>{
 const h=harness('complete');
 await h.wait();
 assert.deepEqual(h.stats(),{removeCount:1,listening:false});
});
