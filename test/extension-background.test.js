import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const background=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function harness({finalUrl='https://example.com/landing',dom={tooLarge:false,html:'<html><head></head><body></body></html>'}}={}){
 let listener,removed=0,scriptCalls=0,created=0;
 const chrome={
  runtime:{id:'micirql-extension',onMessage:{addListener(fn){listener=fn}}},
  tabs:{
   onUpdated:{addListener(){},removeListener(){}},
   async create(){created++;return {id:12,status:'complete'}},
   async get(){return {id:12,status:'complete',url:finalUrl}},
   async remove(){removed++}
  },
  scripting:{async executeScript(){scriptCalls++;return [{result:dom}]}},
 };
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout,console});
 const send=(url)=>new Promise((resolve,reject)=>{
  const result=listener({type:'READ_SEO_HTML',url},{id:'micirql-extension',tab:{url:'https://tools.micirql.com/tools/seo/'},url:'https://tools.micirql.com/tools/seo/'},resolve);
  if(result!==true)reject(Error('Request was not accepted'));
 });
 return {send,stats:()=>({removed,created,scriptCalls})};
}

test('HTML inspection returns the final same-origin URL and closes its tab',async()=>{
 const h=harness();
 const result=await h.send('https://example.com/');
 assert.equal(result.ok,true);
 assert.equal(result.url,'https://example.com/landing');
 assert.deepEqual(h.stats(),{removed:1,created:1,scriptCalls:1});
});

test('HTML inspection rejects cross-origin redirects before reading HTML',async()=>{
 const h=harness({finalUrl:'https://login.other-site.test/'});
 const result=await h.send('https://example.com/');
 assert.equal(result.ok,false);
 assert.match(result.error,/redirected to a different origin/i);
 assert.deepEqual(h.stats(),{removed:1,created:1,scriptCalls:0});
});

test('HTML inspection rejects oversized DOM without returning truncated HTML',async()=>{
 const h=harness({dom:{tooLarge:true,length:1000000}});
 const result=await h.send('https://example.com/');
 assert.equal(result.ok,false);
 assert.match(result.error,/safety limit/);
 assert.equal(h.stats().removed,1);
});

test('HTML inspection rejects an empty HTML response',async()=>{
 const h=harness({dom:{tooLarge:false,html:''}});
 const result=await h.send('https://example.com/');
 assert.equal(result.ok,false);
 assert.match(result.error,/No HTML was returned/);
 assert.equal(h.stats().removed,1);
});
