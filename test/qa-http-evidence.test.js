import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {classifyQaHttpEvidence} from '../public/tools/qa/http-evidence.js';
import {inspectQaHtml,QA_INSPECTOR_VERSION} from '../public/tools/qa/inspector.js';
import {selectQaLayoutSamples} from '../public/tools/qa/layout-sampling.js';
import {summarizeQaDiscovery} from '../public/tools/qa/discovery-coverage.js';
import {selectQaCaptureRetries,isTransientQaCaptureError,QA_CAPTURE_RETRY_LIMIT} from '../public/tools/qa/capture-recovery.js';
import {evaluateQaExtensionHandshake} from '../public/tools/qa/extension-compat.js';

const observed=status=>({ok:true,httpEvidence:{observed:true,status,observationState:'response_observed'}});

test('QA recognizes confirmed HTTP 404/410 as unavailable without scoring their HTML',()=>{
 for(const status of [404,410]){
  const result=classifyQaHttpEvidence(observed(status));
  assert.equal(result.httpError,true);
  assert.equal(result.statusVerified,true);
  assert.equal(result.status,status);
  assert.match(result.reason,new RegExp('Confirmed HTTP '+status));
  assert.match(result.reason,/not available/);
 }
});
test('QA correctly labels access restrictions, rate limits and server errors',()=>{
 for(const [status,message] of [[401,/restricted/],[403,/restricted/],[429,/rate-limited/],[500,/server error/],[503,/server error/]]){
  const result=classifyQaHttpEvidence(observed(status));
  assert.equal(result.httpError,true);
  assert.match(result.reason,message);
 }
});
test('QA never invents a verified HTTP status when Chrome did not observe one',()=>{
 for(const data of [
  {ok:true,html:'<h1>HTML was captured</h1>'},
  {ok:true,httpEvidence:{observed:false,status:404,observationState:'api_unavailable'}},
  {ok:true,httpEvidence:{observed:true,status:404,observationState:'no_response_event'}},
  {ok:true,httpEvidence:{observed:true,status:null,observationState:'response_observed'}},
  {ok:true,httpEvidence:{observed:true,status:999,observationState:'response_observed'}}
 ]){
  const result=classifyQaHttpEvidence(data);
  assert.equal(result.httpError,false);
  assert.equal(result.statusVerified,false);
  assert.equal(result.status,null);
  assert.equal(result.confidence,'unverified');
 }
});
test('QA permits observed successful responses and does not mislabel redirects as server errors',()=>{
 for(const status of [200,201,204,301,302,304]){
  const result=classifyQaHttpEvidence(observed(status));
  assert.equal(result.statusVerified,true);
  assert.equal(result.httpError,false);
  assert.equal(result.status,status);
  assert.equal(result.reason,null);
 }
});
test('QA inspects only successful-status HTML while excluding error documents from findings',async()=>{
 const urls=['https://example.com/','https://example.com/missing','https://example.com/server',
  'https://example.com/unknown','https://example.com/restricted'];
 const requests=[],listeners=new Map(),elements=new Map();
 const location={origin:'https://tools.micirql.com',search:''};
 const window={
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
  postMessage(request){
   requests.push(request);
   const reply=(type,data={})=>{
    for(const fn of [...(listeners.get('message')||[])])fn({
     source:window,origin:location.origin,
     data:{source:'micirql-extension',type,id:request.id,...data}
    });
   };
   if(request.type==='MICIRQL_EXTENSION_PING')
    reply('MICIRQL_EXTENSION_READY',{protocol:3,extensionVersion:'0.3.19',
     capabilities:['discover','seo-http-evidence','qa-layout']});
   if(request.type==='MICIRQL_DISCOVER')
    reply('MICIRQL_DISCOVER_RESULT',{ok:true,pages:urls,scanned:urls.length,errors:[],truncated:false});
   if(request.type==='MICIRQL_SEO_READ'){
    const suffix=new URL(request.url).pathname;
    const status=suffix==='/missing'?404:suffix==='/server'?503:suffix==='/restricted'?403:200;
    const evidence=suffix==='/unknown'?null:{
     observed:true,status,observationState:'response_observed'};
    reply('MICIRQL_SEO_RESULT',{ok:true,url:request.url,partial:false,
     html:'<html><head><title>Example</title></head><body><h1>Response</h1><button></button></body></html>',
     ...(evidence?{httpEvidence:evidence}:{})});
   }
   if(request.type==='MICIRQL_QA_LAYOUT')
    reply('MICIRQL_QA_LAYOUT_RESULT',{ok:true,url:request.url,observations:
     [375,768,1440].map(width=>({width,verified:true,horizontalOverflowPx:0}))});
  }
 };
 const document={getElementById(id){
   if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',dataset:{},addEventListener(){}});
   return elements.get(id);
  },addEventListener(){}};
 const source=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8')
  .replace(/^import [^\n]*\n/gm,'');
 const sandbox={window,document,location,URL,URLSearchParams,Date,Math,Promise,Number,
  inspectQaHtml,QA_INSPECTOR_VERSION,selectQaLayoutSamples,summarizeQaDiscovery,
  selectQaCaptureRetries,isTransientQaCaptureError,QA_CAPTURE_RETRY_LIMIT,
  evaluateQaExtensionHandshake,classifyQaHttpEvidence,
  setTimeout(){return 1},clearTimeout(){}};
 runInNewContext(source+'\nthis.__runQa=scan;',sandbox);
 const report=await sandbox.__runQa(new URL(urls[0]));
 assert.equal(report.pagesSelected,5);
 assert.equal(report.pagesAnalyzed,2,'Only 200 and unknown HTTP status HTML should be inspected');
 assert.equal(report.httpErrors,3);
 assert.equal(report.httpStatusUnknownPages,1);
 assert.equal(report.failures.length,3);
 assert.deepEqual(Array.from(report.failures,entry=>entry.httpStatus),[404,503,403]);
 assert.ok(report.failures.every(x=>x.classification==='http_error'&&x.statusVerified));
 assert.ok(report.reports.every(x=>!x.url.endsWith('/missing')&&!x.url.endsWith('/server')));
 assert.equal(report.reports.find(x=>x.url.endsWith('/unknown')).httpEvidence.statusVerified,false);
 assert.equal(report.reports.find(x=>x.url.endsWith('/')).httpEvidence.status,200);
 assert.equal(report.captureRecovery.attempted,0,'HTTP errors must not be retried as transient browser failures');
 assert.equal(report.layoutPagesRequested,2,'Only real HTML responses are eligible for viewport sampling');
 assert.equal(requests.filter(x=>x.type==='MICIRQL_SEO_READ').length,5);
 assert.equal(report.discovery.status,'completed','Crawl discovery evidence remains separate from page HTTP status');
});
test('QA frontend and print show confirmed HTTP errors without presenting their markup as verified findings',()=>{
 const app=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 assert.match(app,/classifyQaHttpEvidence\(response\)/);
 assert.match(app,/classification:'http_error'/);
 assert.match(app,/confirmed HTTP /);
 assert.match(app,/HTML findings excluded/);
 assert.match(app,/HTTP status unverified for /);
 assert.match(app,/httpStatusUnknownPages/);
});
