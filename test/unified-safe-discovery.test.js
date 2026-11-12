import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/tools/health/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function discoverLocalSubpage(');
const end=source.indexOf('async function readWebsiteHtml(',start);
assert.ok(start>0&&end>start);
const fn=source.slice(start,end);
const origin='https://safe.example/';
function setup(){
 const visited=[],removed=[];
 let current=origin;
 const crawlLinks=[origin+'about',origin+'contact',origin+'logout',
  origin+'api/delete',origin+'checkout',origin+'contact?token=sensitive',
  origin+'admin',origin+'file.pdf','https://outside.example/'];
 const chrome={
  tabs:{
   async create(){return {id:88}},
   async update(id,update){current=update.url;visited.push(current);return {id,url:current}},
   async get(){return {url:current,id:88}},
   async remove(id){removed.push(id)}
  },
  scripting:{async executeScript(){return [{result:current===origin?crawlLinks:[]}]}},
  storage:{local:{async set(){}}}
 };
 const inspect=runInNewContext(fn+';discoverLocalSubpage;',{
  URL,chrome,Set,Promise,waitForUsableTab:async()=>{},wait:async()=>{}
 });
 return {inspect,visited,removed};
}
test('safe-only discovery visits normal public pages but skips action/query endpoints',async()=>{
 const h=setup();
 const result=await h.inspect(origin,true);
 assert.equal(result.ok,true);
 assert.deepEqual(Array.from(result.pages),[origin,origin+'about',origin+'contact']);
 assert.deepEqual(h.visited,[origin,origin+'about',origin+'contact']);
 assert.deepEqual(h.removed,[88]);
 assert.equal(h.visited.some(x=>/logout|delete|checkout|token=|admin/.test(x)),false);
});
test('safe-only discovery rejects an action-route entry before creating tabs',async()=>{
 const h=setup();
 await assert.rejects(()=>h.inspect(origin+'logout',true),/Invalid starting page/);
 assert.equal(h.visited.length,0);
});
test('existing discovery mode remains backward compatible when safeOnly is omitted',async()=>{
 const h=setup();
 const result=await h.inspect(origin);
 assert.equal(result.ok,true);
 assert.ok(h.visited.includes(origin+'logout'));
});
test('trusted extension passes safe flag and unified scanner refuses an older bridge',()=>{
 assert.match(bridge,/safeOnly:event\.data\.safeOnly===true/);
 assert.match(bridge,/safe-page-discovery/);
 assert.match(source,/discoverLocalSubpage\(message\.url,message\.safeOnly===true\)/);
 assert.match(app,/safeOnly:true/);
 assert.match(app,/safe-page-discovery/);
});
