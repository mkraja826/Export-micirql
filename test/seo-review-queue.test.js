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
