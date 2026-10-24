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

test('HTML inspection accepts bounded partial results for oversized DOM',async()=>{
 const h=harness({dom:{partial:true,originalLength:1000000,html:'<html><head></head><body><h1>Test</h1></body></html>'}});
 const result=await h.send('https://example.com/');
 assert.equal(result.ok,true);
 assert.equal(result.partial,true);
 assert.equal(result.originalLength,1000000);
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
 assert.equal(commands.filter(x=>x.method==='Runtime.evaluate'&&x.params.expression.includes('pass<2')).length,3,'Each viewport gets a second scrolling pass');
 assert.equal(commands.filter(x=>x.method==='Runtime.evaluate'&&x.params.expression.includes("image.loading='eager'")).length,3,'Each viewport starts lazy image requests');
 assert.equal(commands.filter(x=>x.method==='Runtime.evaluate'&&x.params.expression.includes('animation.finish()')).length,3,'Each viewport settles finite reveal animations');
 const warmups=commands.map((item,index)=>item.method==='Runtime.evaluate'&&item.params.expression.includes('visibleImages')?index:-1).filter(index=>index>=0);
 const screenshots=commands.map((item,index)=>item.method==='Page.captureScreenshot'?index:-1).filter(index=>index>=0);
 assert.ok(warmups.every((index,i)=>index<screenshots[i]),'Warm-up must precede its screenshot');
 assert.deepEqual(Array.from(result.images,x=>x.name.includes('375px')?'375':x.name.includes('768px')?'768':'1440'),['375','768','1440']);
 assert.equal(detached,1);
 assert.equal(removed,1);
});

test('screenshot capture refuses cross-origin redirects and closes the temporary tab',async()=>{
 let listener,removed=0,detached=0,captured=0;
 const chrome={
  runtime:{id:'micirql-extension',onMessage:{addListener(fn){listener=fn}}},
  storage:{local:{async set(){}}},
  tabs:{
   onUpdated:{addListener(){},removeListener(){}},
   async create(){return {id:52,status:'complete'}},
   async get(){return {id:52,status:'complete',url:'https://unexpected-login.test/sign-in'}},
   async remove(){removed++}
  },
  debugger:{
   async attach(){},async detach(){detached++},
   async sendCommand(_target,method){
    if(method==='Page.captureScreenshot')captured++;
    return {};
   }
  }
 };
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout,console});
 const result=await new Promise(resolve=>{
  assert.equal(listener({type:'CAPTURE',url:'https://example.com/',pages:['https://example.com/'],widths:[375],format:'png',returnImages:true},{id:'micirql-extension',tab:{url:'https://tools.micirql.com/tools/screenshots/'},url:'https://tools.micirql.com/tools/screenshots/'},resolve),true);
 });
 assert.equal(result.ok,false);
 assert.match(result.error,/redirected outside/);
 assert.equal(captured,0);
 assert.equal(detached,1);
 assert.equal(removed,1);
});


test('tall pages are captured as bounded numbered segments',async()=>{
 let listener;const clips=[];
 const chrome={runtime:{id:'micirql-test',onMessage:{addListener(fn){listener=fn}}},storage:{local:{async set(){}}},
 tabs:{onUpdated:{addListener(){},removeListener(){}},async create(){return {id:71,status:'complete'}},async get(){return {id:71,status:'complete',url:'https://example.com/'}},async remove(){}},
 debugger:{async attach(){},async detach(){},async sendCommand(_t,method,params={}){
 if(method==='Page.getLayoutMetrics')return {cssContentSize:{height:25000}};
 if(method==='Page.captureScreenshot'){clips.push(params.clip);return {data:'YWJj'}};
 return {};
 }}};
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout,console});
 const result=await new Promise(resolve=>listener({type:'CAPTURE',url:'https://example.com/',pages:['https://example.com/'],widths:[375],format:'png',returnImages:true},{id:'micirql-test'},resolve));
 assert.equal(result.ok,true,result.error);
 assert.equal(result.count,3);
 assert.deepEqual(clips.map(x=>x.y),[0,12000,24000]);
 assert.deepEqual(clips.map(x=>x.height),[12000,12000,1000]);
 assert.match(result.images[0].name,/part-001-of-3/);
});


test('usable same-origin document recovers after load-event timeout',async()=>{
 const chrome={
  runtime:{onMessage:{addListener(){}}},
  tabs:{onUpdated:{addListener(){},removeListener(){}},async get(){return {url:'https://example.com/slow',status:'loading'}}},
  scripting:{async executeScript(){return [{result:'interactive'}]}}
 };
 const context={chrome,URL,Promise,setTimeout,clearTimeout};
 runInNewContext(background+'\nthis.recover=waitForUsableTab;',context);
 await context.recover(7,'https://example.com/slow',1);
});

test('load-event recovery rejects a different origin',async()=>{
 const chrome={
  runtime:{onMessage:{addListener(){}}},
  tabs:{onUpdated:{addListener(){},removeListener(){}},async get(){return {url:'https://other.test/login',status:'loading'}}},
  scripting:{async executeScript(){throw Error('Must not inspect cross-origin document')}}
 };
 const context={chrome,URL,Promise,setTimeout,clearTimeout};
 runInNewContext(background+'\nthis.recover=waitForUsableTab;',context);
 await assert.rejects(context.recover(7,'https://example.com/',1),/Page load timed out/);
});


test('page discovery shares guarded same-origin loading recovery',async()=>{
 let listener,removed=0;
 const chrome={
  runtime:{id:'micirql-extension',onMessage:{addListener(fn){listener=fn}}},
  tabs:{onUpdated:{addListener(){},removeListener(){}},
   async create(){return {id:101,status:'complete'}},
   async update(){return {id:101,status:'complete'}},
   async get(){return {id:101,status:'complete',url:'https://example.com/'}},
   async remove(){removed++}},
  scripting:{async executeScript(){return [{result:[]}]}}
 };
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout});
 const response=await new Promise(resolve=>listener({type:'DISCOVER_SUBPAGE',url:'https://example.com/'},{id:'micirql-extension'},resolve));
 assert.equal(response.ok,true,response.error);
 assert.deepEqual(Array.from(response.pages),['https://example.com/']);
 assert.equal(removed,1);
 assert.match(background,/await waitForUsableTab\(tab.id,page,25000\)/);
});

test('segmentation boundary at 12001px yields two contiguous clips for each viewport',async()=>{
 let listener;const clips=[];
 const chrome={runtime:{id:'micirql-test',onMessage:{addListener(fn){listener=fn}}},storage:{local:{async set(){}}},
 tabs:{onUpdated:{addListener(){},removeListener(){}},async create(){return {id:88,status:'complete'}},async get(){return {id:88,status:'complete',url:'https://example.com/'}},async remove(){}},
 debugger:{async attach(){},async detach(){},async sendCommand(_target,method,params={}){
 if(method==='Page.getLayoutMetrics')return {cssContentSize:{height:12001}};
 if(method==='Page.captureScreenshot'){clips.push(params.clip);return {data:'YWJj'};}
 return {};
 }}};
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout});
 const result=await new Promise(resolve=>listener({type:'CAPTURE',url:'https://example.com/',pages:['https://example.com/'],widths:[375,768,1440],format:'png',returnImages:true},{id:'micirql-test'},resolve));
 assert.equal(result.ok,true,result.error);
 assert.equal(result.count,6);
 assert.deepEqual(clips.map(x=>[x.width,x.y,x.height]),[[375,0,12000],[375,12000,1],[768,0,12000],[768,12000,1],[1440,0,12000],[1440,12000,1]]);
 assert.equal(new Set(result.images.map(x=>x.name)).size,6);
 assert.ok(result.images.every(x=>/-part-00[12]-of-2/.test(x.name)));
});

test('capture enforces the 60-page maximum before opening Chrome tabs',async()=>{
 let listener,created=0;
 const chrome={runtime:{id:'micirql-test',onMessage:{addListener(fn){listener=fn}}},storage:{local:{async set(){}}},
 tabs:{async create(){created++;throw Error('Simulated browser unavailable')}}};
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout});
 const pages=Array.from({length:61},(_,i)=>'https://example.com/page-'+i);
 const response=await new Promise(resolve=>listener({type:'CAPTURE',url:'https://example.com/',pages,widths:[375,768,1440],format:'jpeg',returnImages:true},{id:'micirql-test'},resolve));
 assert.equal(response.ok,false);
 assert.match(response.error,/no more than 60 pages/i);
 assert.equal(created,0);
});
test('60 unique pages pass batch validation before opening Chrome',async()=>{
 let listener,created=0;
 const chrome={runtime:{id:'micirql-test',onMessage:{addListener(fn){listener=fn}}},storage:{local:{async set(){}}},
 tabs:{async create(){created++;throw Error('Expected mock browser boundary')}}};
 runInNewContext(background,{chrome,URL,Promise,setTimeout,clearTimeout});
 const pages=Array.from({length:60},(_,i)=>'https://example.com/page-'+i);
 const response=await new Promise(resolve=>listener({type:'CAPTURE',url:'https://example.com/',pages,widths:[375,768,1440],format:'jpeg',returnImages:true},{id:'micirql-test'},resolve));
 assert.equal(response.ok,false);
 assert.match(response.error,/Expected mock browser boundary/);
 assert.equal(created,1);
});
