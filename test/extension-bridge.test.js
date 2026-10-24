import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
function setup(){
 const sent=[],requests=[],listeners={};
 const origin='https://tools.micirql.com';
 const window={
  location:{origin},
  addEventListener(type,fn){listeners[type]=fn},
  postMessage(payload,target){sent.push({payload,target})}
 };
 let changeHandler;
 const chrome={
  runtime:{async sendMessage(msg){requests.push(msg);if(msg.type==='DISCOVER_SUBPAGE')return {ok:true,pages:['https://example.com/','https://example.com/about']};if(msg.type==='CAPTURE')return {ok:true,count:6};return {ok:true,html:'<html></html>'}}},
  storage:{onChanged:{addListener(fn){changeHandler=fn},removeListener(fn){if(changeHandler===fn)changeHandler=null}}}
 };
 runInNewContext(source,{window,location:window.location,chrome,Set,Promise,console});
 async function dispatch(type,extra={},sourceOrigin=origin){
  return listeners.message({source:window,origin:sourceOrigin,data:{source:'micirql-web',type,id:'qa-1',...extra}});
 }
 return {dispatch,sent,requests,progress:(data)=>changeHandler?.({captureProgress:{newValue:data}},'local'),hasListener:()=>Boolean(changeHandler)};
}
test('site bridge discovers linked pages locally and returns result to first-party origin',async()=>{
 const h=setup();
 await h.dispatch('MICIRQL_DISCOVER',{url:'https://example.com/'});
 assert.equal(h.requests[0].type,'DISCOVER_SUBPAGE');
 const response=h.sent.find(x=>x.payload.type==='MICIRQL_DISCOVER_RESULT');
 assert.deepEqual(Array.from(response.payload.pages),['https://example.com/','https://example.com/about']);
 assert.equal(response.target,'https://tools.micirql.com');
});
test('site bridge sends all selected bulk pages and streams local progress',async()=>{
 const h=setup();
 const pending=h.dispatch('MICIRQL_CAPTURE',{url:'https://example.com/',pages:['https://example.com/','https://example.com/about'],widths:[375,768,1440],format:'jpeg',zip:true});
 // The underlying mock may complete synchronously: validate eventual capture request and result.
 await pending;
 const request=h.requests.find(x=>x.type==='CAPTURE');
 assert.deepEqual(Array.from(request.pages),['https://example.com/','https://example.com/about']);
 assert.deepEqual(Array.from(request.widths),[375,768,1440]);
 assert.equal(request.zip,true);
 assert.equal(h.sent.find(x=>x.payload.type==='MICIRQL_CAPTURE_RESULT').payload.count,6);
 assert.equal(h.hasListener(),false,'Progress listener must be removed after capture');
});
test('site bridge supports one-page image downloads without ZIP',async()=>{
 const h=setup();
 await h.dispatch('MICIRQL_CAPTURE',{url:'https://example.com/',pages:['https://example.com/'],widths:[375],format:'png',zip:false});
 const request=h.requests.find(x=>x.type==='CAPTURE');
 assert.equal(request.zip,false);
 assert.equal(request.returnImages,false);
});
test('site bridge ignores messages from other origins',async()=>{
 const h=setup();
 await h.dispatch('MICIRQL_CAPTURE',{url:'https://example.com/',widths:[375],format:'png'},'https://other-site.example');
 assert.equal(h.requests.length,0);
});
test('site bridge rejects invalid viewport selections before Chrome capture',async()=>{
 const h=setup();
 await h.dispatch('MICIRQL_CAPTURE',{url:'https://example.com/',widths:[500],format:'png'});
 assert.equal(h.requests.length,0);
 assert.equal(h.sent.find(x=>x.payload.type==='MICIRQL_CAPTURE_RESULT').payload.ok,false);
});

test('extension announces protocol 2 and all website capture capabilities',async()=>{
 const h=setup();
 await h.dispatch('MICIRQL_EXTENSION_PING');
 const ready=h.sent.find(entry=>entry.payload.type==='MICIRQL_EXTENSION_READY');
 assert.equal(ready.payload.protocol,2);
 assert.deepEqual(Array.from(ready.payload.capabilities),['discover','capture','bulk','progress']);
});

test('site bridge forwards discovery progress and cleans up its listener',async()=>{
 const h=setup();
 const pending=h.dispatch('MICIRQL_DISCOVER',{url:'https://example.com/'});
 h.progress({done:1,found:1,errors:0});
 await pending;
 const update=h.sent.find(x=>x.payload.type==='MICIRQL_DISCOVER_PROGRESS');
 assert.equal(update?.payload.progress.done,1);
 assert.equal(h.hasListener(),false);
});
