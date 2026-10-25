import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBatch,reusablePages,auditCoverage} from '../public/tools/seo/audit-lifecycle.js';
const origin='https://example.com';
const pages=Array.from({length:60},(_,i)=>origin+'/page-'+i);
const complete=url=>({url,score:82,auditStatus:'complete',partial:false,findings:[]});
test('60-page stress fixture retries transient errors and accounts for all pages',async()=>{
 const calls=new Map(),progress=[];
 const result=await inspectBatch({origin,pages,inspect:async url=>{
  calls.set(url,(calls.get(url)||0)+1);
  if(url.endsWith('page-5')&&calls.get(url)===1)throw Error('temporary failure');
  if(url.endsWith('page-9'))throw Error('persistent failure');
  return complete(url);
 },onProgress:p=>progress.push(p)});
 assert.equal(result.reports.length,59);
 assert.equal(result.failures.length,1);
 assert.equal(result.coverage.successfulPercent,98);
 assert.equal(result.coverage.complete,59);
 assert.equal(calls.get(origin+'/page-5'),2);
 assert.equal(calls.get(origin+'/page-9'),2);
 assert.equal(progress.length,60);
 assert.deepEqual(progress.map(p=>p.done),Array.from({length:60},(_,i)=>i+1));
});
test('interrupted 60-page run resumes 40 complete pages and rechecks partial results',async()=>{
 const checkpoint={pages,reports:[...pages.slice(0,40).map(complete),{...complete(pages[40]),partial:true}]};
 const calls=[];
 const result=await inspectBatch({origin,pages,checkpoint,inspect:async url=>{calls.push(url);return complete(url)}});
 assert.equal(calls.length,20);
 assert.equal(result.reports.length,60);
 assert.equal(result.coverage.complete,60);
 assert.equal(result.coverage.successfulPercent,100);
});
test('cross-origin and unscored cached pages are never reused',()=>{
 const checkpoint={pages,reports:[complete(pages[0]),{...complete(pages[1]),url:'https://elsewhere.com/'},{...complete(pages[2]),score:null}]};
 assert.deepEqual([...reusablePages(checkpoint,origin,pages).keys()],[pages[0]]);
});
test('coverage rejects missing results and out-of-bounds selection',()=>{
 assert.throws(()=>auditCoverage(pages,[],[]),/account/);
 assert.throws(()=>auditCoverage([...pages,'https://example.com/extra'],[],[]),/1–60/);
});

test('stress runner rejects cross-origin URLs, duplicate pages and excessive retry counts',async()=>{
 const inspect=async url=>complete(url);
 await assert.rejects(inspectBatch({origin,pages:[origin+'/ok','https://other.example/bad'],inspect}),/cross-origin/);
 await assert.rejects(inspectBatch({origin,pages:[origin+'/same',origin+'/same'],inspect}),/Invalid batch/);
 await assert.rejects(inspectBatch({origin,pages:[origin+'/ok'],inspect,maxAttempts:5}),/Retry limit/);
});

test('partial pages are counted as analyzed but not complete',()=>{
 const result=auditCoverage([origin+'/a',origin+'/b'],[complete(origin+'/a'),{...complete(origin+'/b'),partial:true}],[]);
 assert.deepEqual({analyzed:result.analyzed,complete:result.complete,partial:result.partial},{analyzed:2,complete:1,partial:1});
});

test('partial HTML capture retries and accepts a recovered complete page',async()=>{
 const url=origin+'/recover';let calls=0;
 const result=await inspectBatch({origin,pages:[url],inspect:async()=>{
  calls++;return calls===1?{...complete(url),partial:true,auditStatus:'partial'}:complete(url);
 }});
 assert.equal(calls,2);
 assert.equal(result.reports[0].auditStatus,'complete');
 assert.equal(result.reports[0].attempts,2);
 assert.equal(result.coverage.complete,1);
});
test('persistently incomplete HTML remains provisional after bounded retries',async()=>{
 const url=origin+'/still-partial';let calls=0;
 const result=await inspectBatch({origin,pages:[url],inspect:async()=>{
  calls++;return {...complete(url),partial:true,auditStatus:'partial'};
 }});
 assert.equal(calls,2);
 assert.equal(result.reports[0].auditStatus,'partial');
 assert.equal(result.reports[0].attempts,2);
 assert.equal(result.coverage.partial,1);
 assert.equal(result.failures.length,0);
});
test('single attempt does not retry partial HTML',async()=>{
 const url=origin+'/one-attempt';let calls=0;
 const result=await inspectBatch({origin,pages:[url],maxAttempts:1,inspect:async()=>{
  calls++;return {...complete(url),partial:true,auditStatus:'partial'};
 }});
 assert.equal(calls,1);
 assert.equal(result.reports[0].attempts,1);
});

test('partial HTML evidence survives an exception on the second attempt',async()=>{
 const url=origin+'/partial-then-error';let calls=0;
 const result=await inspectBatch({origin,pages:[url],inspect:async()=>{
  calls++;if(calls===2)throw Error('extension timed out');
  return {...complete(url),partial:true,auditStatus:'partial'};
 }});
 assert.equal(calls,2);
 assert.equal(result.reports.length,1);
 assert.equal(result.reports[0].auditStatus,'partial');
 assert.equal(result.reports[0].attempts,2);
 assert.equal(result.failures.length,0);
 assert.equal(result.coverage.partial,1);
});
