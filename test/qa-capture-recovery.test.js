import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {isTransientQaCaptureError,selectQaCaptureRetries,QA_CAPTURE_RETRY_LIMIT}
 from '../public/tools/qa/capture-recovery.js';
import {inspectQaHtml,QA_INSPECTOR_VERSION} from '../public/tools/qa/inspector.js';
import {summarizeQaDiscovery} from '../public/tools/qa/discovery-coverage.js';
import {selectQaLayoutSamples} from '../public/tools/qa/layout-sampling.js';
import {evaluateQaExtensionHandshake} from '../public/tools/qa/extension-compat.js';

const target=url=>({url:'https://example.com/'+url,reason:'Page load timed out'});
const html='<html><head><title>QA test</title></head><body><h1>Testing</h1></body></html>';

test('QA retries only network and navigation timeouts, never blocked or permanent failures',()=>{
 for(const problem of ['Page load timed out','Navigation timeout exceeded','net::ERR_CONNECTION_RESET',
  'net::ERR_TIMED_OUT','Temporary unavailable','Temporarily unavailable','ECONNRESET']){
  assert.equal(isTransientQaCaptureError(problem),true,problem);
 }
 for(const problem of ['403 forbidden','Access denied','HTTP 404','Login required',
  'Redirected outside the selected website','Untrusted credentials',
  'Chrome extension stopped responding','Invalid URL','robots blocked','429 Too Many Requests','']){
  assert.equal(isTransientQaCaptureError(problem),false,problem);
 }
});

test('QA never retries more than five unique temporary failures, and respects a zero budget',()=>{
 const failures=Array.from({length:12},(_,index)=>target('page-'+index));
 failures.splice(4,0,target('page-0'));
 const chosen=selectQaCaptureRetries(failures,1000);
 assert.equal(QA_CAPTURE_RETRY_LIMIT,5);
 assert.equal(chosen.length,5);
 assert.equal(new Set(chosen.map(f=>f.url)).size,5);
 assert.deepEqual(selectQaCaptureRetries(failures,0),[]);
 assert.equal(selectQaCaptureRetries(failures,2).length,2);
 assert.equal(selectQaCaptureRetries([{url:'javascript:alert(1)',reason:'Navigation timed out'}]).length,0);
 assert.equal(selectQaCaptureRetries([{url:'https://user:pass@example.com/',reason:'Page load timed out'}]).length,0);
});

test('QA recovers a transient HTML page once, keeps partial snapshots provisional and logs persistent failures',async()=>{
 const source=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8')
  .replace(/^import [^\n]*\n/gm,'');
 const urls=['','flaky','partial-flaky','blocked','retry-fails','normal']
  .map(part=>'https://example.com/'+part);
 const calls=new Map(),requests=[],listeners=new Map(),elements=new Map();
 const document={
  getElementById(id){
   if(!elements.has(id))elements.set(id,{value:'',textContent:'',dataset:{},hidden:false,
    addEventListener(){}});
   return elements.get(id);
  },
  addEventListener(){}
 };
 const location={origin:'https://tools.micirql.com',search:''};
 const window={
  addEventListener(type,fn){
   if(!listeners.has(type))listeners.set(type,new Set());
   listeners.get(type).add(fn);
  },
  removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
  postMessage(request){
   requests.push(request);
   const reply=(type,fields={})=>{
    for(const fn of [...(listeners.get('message')||[])])fn({
     source:window,origin:location.origin,
     data:{source:'micirql-extension',type,id:request.id,...fields}
    });
   };
   if(request.type==='MICIRQL_EXTENSION_PING')reply('MICIRQL_EXTENSION_READY',{
    protocol:3,extensionVersion:'0.3.19',capabilities:['discover','seo-http-evidence','qa-layout']});
   if(request.type==='MICIRQL_DISCOVER')reply('MICIRQL_DISCOVER_RESULT',{
    ok:true,pages:urls,scanned:urls.length,errors:[],truncated:false});
   if(request.type==='MICIRQL_SEO_READ'){
    const part=new URL(request.url).pathname.slice(1);
    const count=(calls.get(part)||0)+1;calls.set(part,count);
    if(part==='flaky'&&count===1)reply('MICIRQL_SEO_RESULT',{ok:false,error:'Navigation timed out'});
    else if(part==='partial-flaky'&&count===1)
     reply('MICIRQL_SEO_RESULT',{ok:false,error:'net::ERR_CONNECTION_RESET'});
    else if(part==='retry-fails')
     reply('MICIRQL_SEO_RESULT',{ok:false,error:'Page load timed out'});
    else if(part==='blocked')
     reply('MICIRQL_SEO_RESULT',{ok:false,error:'403 forbidden'});
    else reply('MICIRQL_SEO_RESULT',{ok:true,url:request.url,partial:part==='partial-flaky',html});
   }
   if(request.type==='MICIRQL_QA_LAYOUT')
    reply('MICIRQL_QA_LAYOUT_RESULT',{ok:true,url:request.url,observations:
     [375,768,1440].map(width=>({width,verified:true,horizontalOverflowPx:0}))});
  }
 };
 const sandbox={window,document,location,URL,URLSearchParams,Date,Math,Promise,Number,
  inspectQaHtml,QA_INSPECTOR_VERSION,selectQaLayoutSamples,evaluateQaExtensionHandshake,
  summarizeQaDiscovery,selectQaCaptureRetries,isTransientQaCaptureError,QA_CAPTURE_RETRY_LIMIT,
  setTimeout(){return 1},clearTimeout(){}};
 runInNewContext(source+'\nthis.__qaScan=scan;',sandbox);
 const report=await sandbox.__qaScan(new URL('https://example.com/'));
 assert.equal(report.pagesSelected,6);
 assert.equal(report.pagesAnalyzed,3);
 assert.equal(report.partialPages,1);
 assert.equal(report.failures.length,2);
 assert.equal(report.layoutPagesRequested,3);
 assert.equal(report.captureRecovery.attempted,3);
 assert.equal(report.captureRecovery.completed,1);
 assert.equal(report.captureRecovery.partial,1);
 assert.equal(report.captureRecovery.failed,1);
 assert.equal(report.captureRecovery.skippedTransient,0);
 assert.deepEqual(Array.from(report.captureRecovery.entries,entry=>entry.outcome),
  ['complete','partial','unverified']);
 assert.equal(calls.get('flaky'),2);
 assert.equal(calls.get('partial-flaky'),2);
 assert.equal(calls.get('retry-fails'),2);
 assert.equal(calls.get('blocked'),1,'Permanent 403 cannot be retried');
 assert.equal(report.failures.find(f=>f.url.endsWith('/retry-fails')).retryReason,'Page load timed out');
 assert.equal(report.failures.some(f=>f.url.endsWith('/flaky')),false);
 assert.equal(report.reports.find(p=>p.requestedUrl.endsWith('/partial-flaky')).partial,true);
 assert.equal(requests.filter(r=>r.type==='MICIRQL_SEO_READ').length,9);
 assert.equal(requests.filter(r=>r.type==='MICIRQL_QA_LAYOUT').length,3);
 assert.equal(report.discovery.status,'completed','Page capture errors do not change discovery evidence');
});

test('QA recovery metadata stays out of verified issue counts',()=>{
 const reportSource=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 const htmlSource=readFileSync(new URL('../public/tools/qa/index.html',import.meta.url),'utf8');
 assert.match(reportSource,/retryNote/);
 assert.match(reportSource,/still unverified/);
 assert.match(reportSource,/captureRecovery,layoutInspection/);
 assert.match(reportSource,/failure\.retryReason/);
 assert.match(htmlSource,/Save report as PDF/);
});
