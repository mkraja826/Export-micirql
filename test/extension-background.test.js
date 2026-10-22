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

test('screenshot capture applies exactly the three supported viewport widths',async()=>{
 let listener,removed=0,detached=0;
 const commands=[];
 const chrome={
  runtime:{id:'micirql-extension',onMessage:{addListener(fn){listener=fn}}},
  storage:{local:{async set(){}}},
  tabs:{
   onUpdated:{addListener(){},removeListener(){}},
   async create(){return {id:41,status:'complete'}},
   async get(){return {id:41,status:'complete',url:'https://example.com/'}},
   async remove(){removed++}
  },
  debugger:{
   async attach(){},
   async detach(){detached++},
   async sendCommand(_target,method,params={}){
    commands.push({method,params});
    if(method==='Page.getLayoutMetrics')return {cssContentSize:{height:1200}};
    if(method==='Page.captureScreenshot')return {data:'YWJj'};
    return {};
   }
  }
 };
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout,console});
 const result=await new Promise(resolve=>{
  assert.equal(listener({type:'CAPTURE',url:'https://example.com/',pages:['https://example.com/'],widths:[375,768,1440],format:'png',returnImages:true},{id:'micirql-extension',tab:{url:'https://tools.micirql.com/tools/screenshots/'},url:'https://tools.micirql.com/tools/screenshots/'},resolve),true);
 });
 assert.equal(result.ok,true,result.error);
 assert.equal(result.count,3);
 assert.equal(result.images.length,3);
 assert.deepEqual(commands.filter(x=>x.method==='Emulation.setDeviceMetricsOverride').map(x=>x.params.width),[375,768,1440]);
 assert.deepEqual(commands.filter(x=>x.method==='Emulation.setDeviceMetricsOverride').map(x=>x.params.mobile),[true,false,false]);
 assert.deepEqual(commands.filter(x=>x.method==='Page.captureScreenshot').map(x=>x.params.clip.width),[375,768,1440]);
 assert.equal(commands.filter(x=>x.method==='Runtime.evaluate'&&x.params.expression.includes('visibleImages')).length,3,'Each width must warm up lazy-loaded images');
 const warmups=commands.map((item,index)=>item.method==='Runtime.evaluate'&&item.params.expression.includes('visibleImages')?index:-1).filter(index=>index>=0);
 const screenshots=commands.map((item,index)=>item.method==='Page.captureScreenshot'?index:-1).filter(index=>index>=0);
 assert.ok(warmups.every((index,i)=>index<screenshots[i]),'Warm-up must precede its screenshot');
 assert.deepEqual(Array.from(result.images,x=>x.name.includes('375px')?'375':x.name.includes('768px')?'768':'1440'),['375','768','1440']);
 assert.equal(detached,1);
 assert.equal(removed,1);
});
