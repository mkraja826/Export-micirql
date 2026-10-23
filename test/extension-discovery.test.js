import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const background=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function harness(finalUrl){
 let listener,scans=0,removed=0;
 const chrome={
  runtime:{id:'micirql-test',onMessage:{addListener(fn){listener=fn}}},
  tabs:{
   onUpdated:{addListener(){},removeListener(){}},
   async create(){return {id:8,status:'complete'}},
   async update(){return {id:8,status:'complete'}},
   async get(){return {id:8,url:finalUrl,status:'complete'}},
   async remove(){removed++}
  },
  scripting:{async executeScript(){scans++;return [{result:['https://example.com/about/']}]}},
 };
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout,console});
 return {
  scan:()=>new Promise(resolve=>listener({type:'DISCOVER_SUBPAGE',url:'https://example.com/'},{id:'micirql-test',url:'https://tools.micirql.com/tools/screenshots/',tab:{url:'https://tools.micirql.com/tools/screenshots/'}},resolve)),
  stats:()=>({scans,removed})
 };
}
test('page discovery skips redirected cross-origin pages before reading links',async()=>{
 const h=harness('https://login.unrelated.test/');
 const result=await h.scan();
 assert.equal(result.ok,true);
 assert.equal(result.scanned,1);
 assert.equal(result.errors.length,1);
 assert.match(result.errors[0].message,/redirected outside/);
 assert.deepEqual(h.stats(),{scans:0,removed:1});
});
test('page discovery continues scanning same-origin landing pages',async()=>{
 const h=harness('https://example.com/');
 const result=await h.scan();
 assert.equal(result.ok,true);
 assert.equal(result.errors.length,0);
 assert.ok(h.stats().scans>0);
 assert.equal(h.stats().removed,1);
});
