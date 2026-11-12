import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeoReviewQueue} from '../src/seo-review-queue.js';
const root='https://sample.test/';
const page=(suffix,extra={})=>({url:root+suffix,auditStatus:'complete',partial:false,pageRole:'public',...extra});
const make=()=>({website:root,scoringVersion:'micirql-seo-v3.6',
 reports:[page(''),page('a'),page('b'),page('private',{pageRole:'application'}),
  page('slow',{auditStatus:'partial',partial:true})],
 issueCenter:[{code:'missing_title',severity:'high',affectedUrls:[root,root+'a',root+'private']},
  {code:'http_noindex',severity:'high',affectedUrls:[root+'b',root+'slow']}]});
test('review queue is unreviewed, balanced, bounded, deterministic, and does not mutate source',()=>{
 const audit=make(),before=JSON.stringify(audit);
 const first=createSeoReviewQueue(audit,{maxCases:6});
 const second=createSeoReviewQueue(audit,{maxCases:6});
 assert.deepEqual(first,second);
 assert.equal(JSON.stringify(audit),before);
 assert.equal(first.status,'draft_unreviewed');
 assert.equal(first.provenance.sourceGeneratedAt,null);
 assert.match(first.provenance.freshnessRequirement,/24 hours/);
 assert.equal(first.reviewer,null);
 assert.equal(first.selectedCount,6);
 assert.ok(first.candidates.detectedCandidates>0);
 assert.ok(first.candidates.undetectedControls>0);
 assert.ok(first.labels.every(x=>x.expected==='unknown'&&x.evidence===null));
 assert.ok(first.labels.every(x=>!x.url.includes('/private')&&!x.url.includes('/slow')));
 assert.equal(new Set(first.labels.map(x=>x.url+'|'+x.code)).size,first.labels.length);
});
test('no fabricated negatives when issue codes never appeared in an audit',()=>{
 const q=createSeoReviewQueue({website:root,reports:[page('')],issueCenter:[]});
 assert.equal(q.selectedCount,0);
 assert.equal(q.totalCandidates,0);
});
test('no negative controls inferred from failed or partial page captures',()=>{
 const q=createSeoReviewQueue({website:root,
 reports:[page('',{partial:true,auditStatus:'partial'}),page('b',{auditStatus:'failed'})],
 issueCenter:[{code:'missing_title',severity:'high',affectedUrls:[root]}]});
 assert.equal(q.candidates.undetectedControls,0);
 assert.equal(q.labels.length,0,'Partial HTML cannot establish detected review candidates');
});
test('max cases input bounded and unknown origin URLs excluded',()=>{
 assert.throws(()=>createSeoReviewQueue(make(),{maxCases:501}),/1–500/);
 const audit=make();audit.issueCenter[0].affectedUrls.push('https://outside.test/private');
 const q=createSeoReviewQueue(audit,{maxCases:30});
 assert.equal(q.labels.some(x=>x.url.includes('outside.test')),false);
});

test('bounded review queue samples many issue codes rather than the first crowded code',()=>{
 const urls=Array.from({length:30},(_,i)=>root+'public-'+i);
 const codes=Array.from({length:10},(_,i)=>'check_'+String(i).padStart(2,'0'));
 const audit={website:root,generatedAt:'2026-11-12T10:00:00Z',
  reports:urls.map(url=>({url,auditStatus:'complete',partial:false,pageRole:'public'})),
  issueCenter:codes.map(code=>({code,severity:'medium',affectedUrls:urls.slice(0,3)}))
 };
 const first=createSeoReviewQueue(audit,{maxCases:20});
 const second=createSeoReviewQueue(audit,{maxCases:20});
 assert.deepEqual(first,second,'same audit yields the same bounded sample');
 assert.equal(first.selectedCount,20);
 assert.deepEqual(first.candidates,{detectedCandidates:10,undetectedControls:10});
 assert.equal(first.sampling.strategy,'balanced_issue_code_round_robin_v1');
 assert.equal(first.sampling.availableIssueCodes,10);
 assert.equal(first.sampling.selectedIssueCodes,10);
 assert.ok(first.sampling.selectedByCode.every(x=>x.detectedCandidates===1&&x.undetectedControls===1));
 assert.equal(new Set(first.labels.map(x=>x.url+'|'+x.code)).size,20);
 assert.ok(first.labels.every(x=>x.expected==='unknown'&&x.evidence===null));
});

test('uneven issue-code populations and exhaustion preserve both review categories',()=>{
 const urls=Array.from({length:26},(_,i)=>root+'balance-'+i);
 const audit={website:root,
  reports:urls.map(url=>({url,auditStatus:'complete',partial:false})),
  issueCenter:[
   {code:'a_heavy',affectedUrls:urls.slice(0,25)},
   {code:'b_rare',affectedUrls:urls.slice(0,1)}
  ]
 };
 const q=createSeoReviewQueue(audit,{maxCases:8});
 assert.equal(q.selectedCount,8);
 assert.equal(q.sampling.selectedIssueCodes,2);
 assert.equal(q.candidates.detectedCandidates,4);
 assert.equal(q.candidates.undetectedControls,4);
 assert.ok(q.sampling.selectedByCode.some(x=>x.code==='b_rare'&&x.detectedCandidates>0&&x.undetectedControls>0));
 const positiveOnly=createSeoReviewQueue({website:root,
  reports:[page('single')],
  issueCenter:[{code:'only_issue',affectedUrls:[root+'single']}]},{maxCases:8});
 assert.equal(positiveOnly.selectedCount,1);
 assert.deepEqual(positiveOnly.candidates,{detectedCandidates:1,undetectedControls:0});
});

test('negative control sampling remains limited to issue codes actually detected',()=>{
 const urls=Array.from({length:5},(_,i)=>root+'negative-'+i);
 const q=createSeoReviewQueue({website:root,reports:urls.map(url=>({url,auditStatus:'complete',partial:false})),
  issueCenter:[{code:'only_title',affectedUrls:[urls[0]]}]},{maxCases:10});
 assert.equal(q.sampling.availableIssueCodes,1);
 assert.equal(q.sampling.selectedIssueCodes,1);
 assert.equal(q.candidates.detectedCandidates,1);
 assert.equal(q.candidates.undetectedControls,4);
 assert.ok(q.labels.every(l=>l.code==='only_title'));
});
