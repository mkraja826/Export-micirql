import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSeoDetectionAccuracy,SEO_GROUND_TRUTH_VERSION} from '../src/seo-accuracy-evaluation.js';
const site='https://evidence.test/';
const evidence=(detail='Browser-verified response')=>({
 type:'independent-http',observedAt:'2026-11-02T12:00:00Z',detail
});
const page=(url,extra={})=>({url,requestedUrl:url,auditStatus:'complete',partial:false,score:90,...extra});
const issue=(code,urls)=>({code,severity:'high',affectedUrls:urls});
const pair=(audit,labels,website=site)=>({
 audit:{website,reports:audit.reports,issueCenter:audit.issueCenter||[]},
 groundTruth:{schemaVersion:SEO_GROUND_TRUTH_VERSION,website,reviewer:'Independent reviewer',
  labels:labels.map(l=>({evidence:evidence(),...l}))}
});
test('independent evidence confusion matrix counts false alarms and missed findings',()=>{
 const a=site+'a',b=site+'b',c=site+'c',d=site+'d';
 const sample=pair({reports:[page(a),page(b),page(c),page(d)],
  issueCenter:[issue('http_noindex',[a,b])]},[
  {url:a,code:'http_noindex',expected:'present'}, // true positive
  {url:b,code:'http_noindex',expected:'absent'},  // false positive
  {url:c,code:'http_noindex',expected:'present'}, // false negative
  {url:d,code:'http_noindex',expected:'absent'}   // true negative
 ]);
 const original=JSON.stringify(sample);
 const result=evaluateSeoDetectionAccuracy([sample]);
 assert.deepEqual(result.confusion,{tp:1,fp:1,tn:1,fn:1});
 assert.equal(result.precision,0.5);assert.equal(result.recall,0.5);
 assert.equal(result.falsePositiveRate,0.5);
 assert.equal(result.examples.length,2);
 assert.equal(result.readyForReleaseClaim,false);
 assert.equal(result.targetMet,false);
 assert.equal(result.verdict,'insufficient_independent_evidence');
 assert.equal(JSON.stringify(sample),original);
});
test('uninspected and unknown truth labels abstain instead of inventing negatives',()=>{
 const a=site+'a',b=site+'b',c=site+'c';
 const value=evaluateSeoDetectionAccuracy([pair({
  reports:[page(a),page(b,{auditStatus:'partial',partial:true})],issueCenter:[]
 },[
  {url:a,code:'http_noindex',expected:'absent'},
  {url:b,code:'http_noindex',expected:'present'},
  {url:c,code:'http_noindex',expected:'present'},
  {url:a,code:'missing_title',expected:'unknown',evidence:undefined}
 ])]);
 assert.equal(value.eligibleLabels,1);
 assert.equal(value.abstained,3);
 assert.deepEqual(value.abstainReasons,{notInspected:2,unknownTruth:1});
 assert.deepEqual(value.confusion,{tp:0,fp:0,tn:1,fn:0});
});
test('verified HTTP error pages are evaluated for HTTP findings without fake HTML scores',()=>{
 const url=site+'broken';
 const audit={reports:[page(url,{score:null,auditStatus:'invalid_http_status',
   httpVerification:{verified:true,status:404}})],
  issueCenter:[issue('http_not_found',[url])]};
 const r=evaluateSeoDetectionAccuracy([pair(audit,[{url,code:'http_not_found',expected:'present'}])]);
 assert.equal(r.confusion.tp,1);
 assert.equal(r.eligibleLabels,1);
 assert.equal(audit.reports[0].score,null);
});
test('HTTP errors without observed response are not evaluated',()=>{
 const url=site+'broken';
 const r=evaluateSeoDetectionAccuracy([pair({reports:[page(url,{
  score:null,auditStatus:'invalid_http_status',httpVerification:{verified:false,status:null}
 })],issueCenter:[]},[{url,code:'http_not_found',expected:'present'}])]);
 assert.equal(r.confusion.fn,0);
 assert.equal(r.abstained,1);
});
test('refuses unverifiable, overview-only and cross-origin ground truth',()=>{
 const a=site+'a';
 const audit={reports:[page(a)]};
 const sample=pair(audit,[{url:a,code:'noindex',expected:'present'}]);
 sample.groundTruth.labels[0].evidence={type:'semrush-overview',observedAt:'2026-11-02T12:00:00Z',detail:'89% site health'};
 assert.throws(()=>evaluateSeoDetectionAccuracy([sample]),/Independent, timestamped URL-level evidence/);
 sample.groundTruth.labels[0].evidence=evidence('');
 assert.throws(()=>evaluateSeoDetectionAccuracy([sample]),/Independent, timestamped URL-level evidence/);
 sample.groundTruth.labels[0].evidence=evidence();
 sample.groundTruth.labels[0].url='https://outside.test/a';
 assert.throws(()=>evaluateSeoDetectionAccuracy([sample]),/cross-origin/);
});
test('duplicate labels cannot inflate benchmark denominator',()=>{
 const a=site+'a';
 const sample=pair({reports:[page(a)]},[
  {url:a,code:'http_noindex',expected:'present'},
  {url:a,code:'http_noindex',expected:'present'}
 ]);
 assert.throws(()=>evaluateSeoDetectionAccuracy([sample]),/Duplicate ground truth/);
});
test('100 independently labeled cases across five websites can qualify for target assessment',()=>{
 const pairs=Array.from({length:5},(_,i)=>{
  const website='https://benchmark-'+i+'.test/';
  const urls=Array.from({length:20},(_,j)=>website+'page-'+j);
  return pair({reports:urls.map(u=>page(u)),
   issueCenter:[issue('http_noindex',urls.slice(0,10))]},
   urls.map((u,j)=>({url:u,code:'http_noindex',expected:j<10?'present':'absent'})),website);
 });
 const result=evaluateSeoDetectionAccuracy(pairs);
 assert.equal(result.totalLabels,100);
 assert.equal(result.eligibleLabels,100);
 assert.equal(result.positives,50);assert.equal(result.negatives,50);
 assert.equal(result.sites,5);
 assert.equal(result.precision,1);assert.equal(result.recall,1);
 assert.equal(result.sampleThresholdMet,true);
 assert.equal(result.readyForReleaseClaim,false,'Human evidence review cannot be automated');
 assert.equal(result.independentReviewSignoffRequired,true);
 assert.equal(result.targetMet,true);
 assert.equal(result.verdict,'proposed_target_met_for_submitted_labels');
 // These data are synthetic; this test only verifies the evaluator itself.
});

test('same site URL and issue cannot be counted twice across benchmark files',()=>{
 const a=site+'a';
 const sample=pair({reports:[page(a)],issueCenter:[issue('noindex',[a])]},
  [{url:a,code:'noindex',expected:'present'}]);
 assert.throws(()=>evaluateSeoDetectionAccuracy([sample,sample]),/Duplicate cross-dataset/);
});
test('unbalanced site sampling does not qualify for a 95% claim',()=>{
 const pairs=Array.from({length:5},(_,i)=>{
  const website='https://unbalanced-'+i+'.test/';
  const n=i===0?96:1;
  const urls=Array.from({length:n},(_,j)=>website+'p-'+j);
  return pair({reports:urls.map(u=>page(u)),issueCenter:[issue('noindex',urls.slice(0,n===1?1:48))]},
   urls.map((u,j)=>({url:u,code:'noindex',expected:j<(n===1?1:48)?'present':'absent'})),website);
 });
 const r=evaluateSeoDetectionAccuracy(pairs);
 assert.equal(r.totalLabels,100);
 assert.equal(r.sampleThresholdMet,false);
 assert.equal(r.readyForReleaseClaim,false);
 assert.equal(r.verdict,'insufficient_independent_evidence');
});
