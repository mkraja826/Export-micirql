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

test('individual full-page capture waits for Chrome to finish saving the image',async()=>{
 let listener,downloadChange,removed=0,detached=0,savedPercent=0;
 const events=[];
 const chrome={
  runtime:{id:'micirql-test',onMessage:{addListener(fn){listener=fn}}},
  tabs:{
   onUpdated:{addListener(){},removeListener(){}},
   async create(){return {id:91,status:'complete'}},
   async get(){return {id:91,status:'complete',url:'https://example.com/'}},
   async remove(){removed++}
  },
  storage:{local:{async set(record){savedPercent=record.captureProgress.percent;events.push({kind:'progress',percent:savedPercent})}}},
  downloads:{
   async download(){events.push({kind:'download-start'});return 55},
   async search(){return [{id:55,state:'in_progress'}]},
   onChanged:{addListener(fn){downloadChange=fn},removeListener(fn){if(downloadChange===fn)downloadChange=null}}
  },
  debugger:{
   async attach(){},async detach(){detached++},
   async sendCommand(_target,method){
    if(method==='Page.getLayoutMetrics')return {cssContentSize:{height:1000}};
    if(method==='Page.captureScreenshot')return {data:'YWJj'};
    return {};
   }
  }
 };
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout});
 let callbackResponse;
 const pending=new Promise(resolve=>{
  listener({type:'CAPTURE',url:'https://example.com/',pages:['https://example.com/'],widths:[375],format:'png'}, {id:'micirql-test'},value=>{callbackResponse=value;resolve(value)});
 });
 await new Promise(resolve=>setTimeout(resolve,1300));
 assert.ok(downloadChange,'Chrome download listener should be installed');
 assert.equal(callbackResponse,undefined,'Capture callback must not finish while image is downloading');
 assert.ok(savedPercent<100,'Progress must remain below 100 until download completes');
 downloadChange({id:55,state:{current:'complete'}});
 const result=await pending;
 assert.equal(result.ok,true,result.error);
 assert.equal(savedPercent,100);
 assert.equal(removed,1);
 assert.equal(detached,1);
 assert.equal(downloadChange,null);
});
