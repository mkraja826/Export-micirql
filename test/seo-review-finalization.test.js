import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createSeoReviewQueue} from '../src/seo-review-queue.js';
import {finalizeSeoReviewDraft} from '../src/seo-review-finalization.js';
import {evaluateSeoDetectionAccuracy} from '../src/seo-accuracy-evaluation.js';

const root='https://independence.test/';
const audit=()=>({
 website:root,generatedAt:'2026-11-12T10:00:00Z',
 scoringVersion:'micirql-seo-v3.6',
 reports:['','a','b'].map(s=>({url:root+s,auditStatus:'complete',partial:false,pageRole:'public'})),
 issueCenter:[{code:'missing_title',affectedUrls:[root]},
  {code:'noindex',affectedUrls:[root+'a']}]
});
const evidence=(observedAt='2026-11-12T10:30:00Z')=>({
 type:'independent-html',observedAt,
 detail:'Reviewer checked the captured DOM and confirmed the page metadata'
});
const pair=()=>{
 const original=createSeoReviewQueue(audit());
 const reviewed=structuredClone(original);
 reviewed.reviewer='Independent reviewer initials: QA';
 reviewed.labels[0].expected='present';
 reviewed.labels[0].evidence=evidence();
 reviewed.labels[1].expected='absent';
 reviewed.labels[1].evidence=evidence();
 return {original,reviewed};
};

test('finalization converts only manually reviewed cases and preserves immutable inputs',()=>{
 const {original,reviewed}=pair();
 const before=JSON.stringify(original),after=JSON.stringify(reviewed);
 const result=finalizeSeoReviewDraft(original,reviewed);
 assert.equal(JSON.stringify(original),before);
 assert.equal(JSON.stringify(reviewed),after);
 assert.equal(result.schemaVersion,'micirql-seo-ground-truth-v1');
 assert.equal(result.reviewStatus,'self_reported_unverified');
 assert.equal(result.independentReviewSignoffRequired,true);
 assert.equal(result.labels.length,original.labels.length);
 assert.equal(result.provenance.reviewedCaseCount,2);
 assert.equal(result.provenance.unknownCaseCount,original.labels.length-2);
 assert.ok(result.labels.every((l,i)=>l.url===original.labels[i].url&&l.code===original.labels[i].code));
 assert.ok(result.labels.slice(2).every(l=>l.expected==='unknown'&&l.evidence===null));
 const accuracy=evaluateSeoDetectionAccuracy([{audit:audit(),groundTruth:result}]);
 assert.equal(accuracy.eligibleLabels,2);
 assert.equal(accuracy.readyForReleaseClaim,false);
});
test('review cannot replace cases, origin, or missing reviewer',()=>{
 const {original,reviewed}=pair();
 reviewed.labels[0].url='https://other.test/';
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/was changed/);
 reviewed.labels[0].url=original.labels[0].url;
 reviewed.labels[1].code='changed_issue';
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/was changed/);
 reviewed.labels[1].code=original.labels[1].code;
 reviewed.website='https://other.test/';
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/retain original schema/);
 reviewed.website=original.website;reviewed.reviewer=' ';
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/Reviewer identity/);
});
test('source must be unreviewed; duplicate cases and invented original labels rejected',()=>{
 const {original,reviewed}=pair();
 original.labels[0].expected='present';
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/original draft was changed/);
 original.labels[0].expected='unknown';
 original.labels[1]={...original.labels[0]};
 reviewed.labels[1]={...reviewed.labels[0]};
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/Duplicate original URL/);
});
test('missing or stale evidence is rejected before a verified label is written',()=>{
 const {original,reviewed}=pair();
 reviewed.labels[0].evidence=null;
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/Independent evidence/);
 reviewed.labels[0].evidence=evidence('2026-11-14T10:00:00Z');
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/outside 24-hour/);
 reviewed.labels[0].evidence=evidence('2026-11-12T10:00:00');
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/Independent evidence/);
 reviewed.labels[0].evidence=evidence();
 original.provenance.sourceGeneratedAt=null;
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/Fresh, timezone-qualified/);
});
test('unknown cases cannot carry faux evidence and decisions must be valid',()=>{
 const {original,reviewed}=pair();
 reviewed.labels[2].evidence=evidence();
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/Unknown decisions/);
 reviewed.labels[2].evidence=null;
 reviewed.labels[2].expected='probably';
 assert.throws(()=>finalizeSeoReviewDraft(original,reviewed),/Review decision/);
});
test('review finalization CLI prevents input overwrite and writes evaluator-ready JSON',()=>{
 const dir=mkdtempSync(join(tmpdir(),'micirql-review-'));
 try{
  const {original,reviewed}=pair();
  const source=join(dir,'original.json'),edit=join(dir,'reviewed.json'),out=join(dir,'labels.json');
  writeFileSync(source,JSON.stringify(original));writeFileSync(edit,JSON.stringify(reviewed));
  const cli=new URL('../scripts/finalize-seo-review.mjs',import.meta.url);
  const run=spawnSync(process.execPath,[cli.pathname,'--original',source,'--reviewed',edit,'--output',out],
   {encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(readFileSync(out,'utf8'));
  assert.equal(result.labels.length,original.labels.length);
  assert.equal(result.provenance.reviewedCaseCount,2);
  assert.match(run.stdout,/self-reported|self.reported/i);
  const overwrite=spawnSync(process.execPath,[cli.pathname,'--original',source,'--reviewed',edit,'--output',source],
   {encoding:'utf8',timeout:10000});
  assert.equal(overwrite.status,1);
  assert.match(overwrite.stderr,/must be separate/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
