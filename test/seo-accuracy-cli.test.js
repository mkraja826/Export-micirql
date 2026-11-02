import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const cli=new URL('../scripts/evaluate-seo-accuracy.mjs',import.meta.url);
test('accuracy CLI evaluates offline JSON evidence and writes a machine-readable report',()=>{
 const dir=mkdtempSync(join(tmpdir(),'micirql-seo-accuracy-'));
 try{
  const url='https://fixture.test/';
  const audit={website:url,reports:[{url,auditStatus:'complete',partial:false,score:90}],
   issueCenter:[{code:'http_noindex',severity:'high',affectedUrls:[url]}]};
  const truth={schemaVersion:'micirql-seo-ground-truth-v1',website:url,reviewer:'Test reviewer',
   labels:[{url,code:'http_noindex',expected:'present',evidence:{
    type:'independent-http',observedAt:'2026-11-02T12:00:00Z',detail:'Observed X-Robots-Tag: noindex'
   }}]};
  const a=join(dir,'audit.json'),b=join(dir,'truth.json'),out=join(dir,'report.json');
  writeFileSync(a,JSON.stringify(audit));writeFileSync(b,JSON.stringify(truth));
  const result=spawnSync(process.execPath,[cli.pathname,'--pair',a,b,'--output',out],
   {encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(readFileSync(out,'utf8'));
  assert.equal(report.confusion.tp,1);
  assert.equal(report.totalLabels,1);
  assert.equal(report.readyForReleaseClaim,false);
  assert.equal(report.verdict,'insufficient_independent_evidence');
  assert.equal(JSON.parse(result.stdout).version,'micirql-detection-benchmark-v1');
  const enforced=spawnSync(process.execPath,[cli.pathname,'--pair',a,b,'--enforce'],
   {encoding:'utf8',timeout:10000});
  assert.equal(enforced.status,1,'Unrepresentative single-URL sample must fail enforcement');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('accuracy CLI rejects missing input instead of emitting imaginary precision',()=>{
 const result=spawnSync(process.execPath,[cli.pathname],
  {encoding:'utf8',timeout:10000});
 assert.equal(result.status,1);
 assert.match(result.stderr,/Accuracy evaluation failed/);
});
