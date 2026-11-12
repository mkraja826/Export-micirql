// Synthetic fixtures validate reporting logic; no real-world accuracy claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {evaluateSeoDetectionAccuracy} from '../src/seo-accuracy-evaluation.js';
import {renderSeoCoverageMarkdown} from '../src/seo-benchmark-coverage-report.js';

const at='2026-11-12T10:00:00Z';
const evidence=(observedAt=at)=>({
 type:'independent-html',observedAt,detail:'Reviewer inspected the rendered page and found this condition'
});
const makePair=(domain,labels,issues=[])=>{
 const website='https://'+domain+'.test/';
 const urls=[...new Set(labels.map(l=>l.url))];
 return {
  audit:{website,generatedAt:at,
   reports:urls.map(url=>({url,auditStatus:'complete',partial:false,pageRole:'public'})),
   issueCenter:issues.map(([code,affectedUrls])=>({code,affectedUrls,severity:'medium'}))},
  groundTruth:{schemaVersion:'micirql-seo-ground-truth-v1',website,
   reviewer:'Synthetic fixture reviewer',labels:labels.map(l=>({
    evidence:l.expected==='unknown'?null:evidence(l.observedAt),
    url:l.url,code:l.code,expected:l.expected
   }))}
 };
};
test('coverage separates per-code false alarms, misses, and abstentions',()=>{
 const root='https://coverage.test/';
 const labels=[
  {url:root+'a',code:'alpha_issue',expected:'present'},
  {url:root+'b',code:'alpha_issue',expected:'absent'},
  {url:root+'c',code:'alpha_issue',expected:'present'},
  {url:root+'d',code:'alpha_issue',expected:'absent'},
  {url:root+'e',code:'beta_issue',expected:'absent'},
  {url:root+'f',code:'beta_issue',expected:'unknown'},
  {url:root+'g',code:'beta_issue',expected:'present',observedAt:'2026-11-20T10:00:00Z'}
 ];
 const pair=makePair('coverage',labels,[['alpha_issue',[root+'a',root+'b']]]);
 const before=JSON.stringify(pair),res=evaluateSeoDetectionAccuracy([pair]);
 assert.equal(JSON.stringify(pair),before);
 const coverage=res.coverageReport;
 assert.equal(coverage.representedIssueCodes,2);
 assert.equal(coverage.coverageScreenedCodes,0);
 assert.equal(coverage.issueCodes[0].code,'alpha_issue');
 assert.equal(coverage.issueCodes[0].priority,1);
 assert.deepEqual(coverage.issueCodes[0].confusion,{tp:1,fp:1,tn:1,fn:1});
 assert.equal(coverage.issueCodes[0].precision,0.5);
 assert.equal(coverage.issueCodes[0].recall,0.5);
 const beta=coverage.issueCodes.find(x=>x.code==='beta_issue');
 assert.equal(beta.eligibleLabels,1);
 assert.equal(beta.abstained,2);
 assert.equal(beta.abstentions.unknownTruth,1);
 assert.equal(beta.abstentions.staleEvidence,1);
 assert.deepEqual(coverage.reviewPriorities.map(x=>x.code),['alpha_issue','beta_issue']);
 const markdown=renderSeoCoverageMarkdown(res);
 assert.match(markdown,/alpha_issue/);
 assert.match(markdown,/Insufficient evidence/);
 assert.match(markdown,/Internal reviewer report/);
 assert.doesNotMatch(markdown,/https:\/\/coverage\.test/,'Coverage summary must not leak page URLs');
 assert.equal(res.readyForReleaseClaim,false);
});
test('balanced per-code sampling screen does not imply a certified accuracy claim',()=>{
 const pairs=Array.from({length:2},(_,i)=>{
  const root='https://two-sites-'+i+'.test/';
  const labels=Array.from({length:10},(_,j)=>({
   url:root+'page-'+j,code:'missing_title',expected:j<5?'present':'absent'
  }));
  return makePair('two-sites-'+i,labels,[['missing_title',labels.slice(0,5).map(l=>l.url)]]);
 });
 const result=evaluateSeoDetectionAccuracy(pairs);
 const row=result.coverageReport.issueCodes[0];
 assert.equal(row.eligibleLabels,20);
 assert.equal(row.sites,2);
 assert.equal(row.positives,10);
 assert.equal(row.negatives,10);
 assert.equal(row.screeningCoverageMet,true);
 assert.equal(result.coverageReport.coverageScreenedCodes,1);
 assert.equal(result.coverageReport.reviewPriorities.length,0);
 assert.equal(result.sampleThresholdMet,false,'Global sample requires five sites and five issue codes');
 assert.equal(result.targetMet,false);
 assert.equal(result.readyForReleaseClaim,false);
 assert.match(renderSeoCoverageMarkdown(result),/Preliminary coverage/);
});
test('no labels and unknown labels never produce fake 100 percent accuracy',()=>{
 const pair=makePair('unknown-only',[{
  url:'https://unknown-only.test/',code:'http_noindex',expected:'unknown'
 }]);
 const result=evaluateSeoDetectionAccuracy([pair]);
 const code=result.coverageReport.issueCodes[0];
 assert.equal(code.eligibleLabels,0);
 assert.equal(code.sites,0);
 assert.equal(code.precision,null);assert.equal(code.recall,null);
 assert.equal(code.disagreementStatus,'not_evaluated');
 assert.equal(code.screeningCoverageMet,false);
 assert.match(renderSeoCoverageMarkdown(result),/n\/a/);
 const empty=makePair('no-codes',[]);
 const zero=evaluateSeoDetectionAccuracy([empty]);
 assert.equal(zero.coverageReport.representedIssueCodes,0);
 assert.deepEqual(zero.coverageReport.reviewPriorities,[]);
 assert.match(renderSeoCoverageMarkdown(zero),/No independently labeled issue codes supplied/);
});
test('benchmark CLI writes reviewable Markdown and protects source evidence files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'seo-coverage-'));
 try{
  const root='https://cli-sample.test/';
  const pair=makePair('cli-sample',[{url:root,code:'missing_title',expected:'present'}],
   [['missing_title',[root]]]);
  const audit=join(dir,'audit.json'),truth=join(dir,'labels.json');
  const out=join(dir,'benchmark.json'),report=join(dir,'coverage.md');
  writeFileSync(audit,JSON.stringify(pair.audit));
  writeFileSync(truth,JSON.stringify(pair.groundTruth));
  const cli=new URL('../scripts/evaluate-seo-accuracy.mjs',import.meta.url);
  const run=spawnSync(process.execPath,[cli.pathname,'--pair',audit,truth,
   '--output',out,'--coverage-output',report],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(JSON.parse(readFileSync(out,'utf8')).coverageReport.representedIssueCodes,1);
  assert.match(readFileSync(report,'utf8'),/missing_title/);
  assert.doesNotMatch(readFileSync(report,'utf8'),/https:\/\/cli-sample\.test/);
  const overwrite=spawnSync(process.execPath,[cli.pathname,'--pair',audit,truth,
   '--coverage-output',audit],{encoding:'utf8',timeout:10000});
  assert.equal(overwrite.status,1);
  assert.match(overwrite.stderr,/distinct from each other/);
  assert.equal(JSON.parse(readFileSync(audit,'utf8')).website,root);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
