import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueFinalPages,auditCoverage} from '../public/tools/seo/audit-lifecycle.js';
import {interpretHttpEvidence} from '../public/tools/seo/http-evidence.js';

// Deterministic reproductions of known public benchmark scenarios.
// These fixtures verify our engine behavior, not live Chrome-extension capture.
const observed=(status,headers={},redirects=[])=>({observed:true,status,headers,redirects,requestedUrl:'https://example.test/start',finalUrl:'https://example.test/final'});
const report=(requestedUrl,url,title='Shared title')=>({requestedUrl,url,title,description:'Shared description',canonical:url,score:86,auditStatus:'complete',partial:false});
test('BadSEO: homepage and redirected chain are one final document',()=>{
 const origin='https://badseo.dev/';
 const pages=[origin,'https://badseo.dev/redirect/chain-1'];
 const reports=pages.map(p=>report(p,origin));
 assert.equal(uniqueFinalPages(reports).length,1);
 assert.equal(auditCoverage(pages,reports,[]).uniqueFinalPages,1);
});
test('BadSEO: HTTP header noindex and canonical conflict',()=>{
 const headers={'x-robots-tag':'noindex, nofollow',link:'<https://badseo.dev/other>; rel="canonical"'};
 const findings=interpretHttpEvidence(observed(200,headers),'https://badseo.dev/','https://badseo.dev/').findings.map(f=>f.code);
 assert.ok(findings.includes('http_noindex'));
 assert.ok(findings.includes('http_canonical_conflict'));
});
test('TestingURL: broken destination status and redirect cycle are distinct evidence',()=>{
 assert.ok(interpretHttpEvidence(observed(404)).findings.some(f=>f.code==='http_not_found'));
 const redirects=[{url:'https://testingurl.dev/a',status:301,location:'/b'},{url:'https://testingurl.dev/b',status:302,location:'/a'}];
 assert.ok(interpretHttpEvidence(observed(200,{},redirects)).findings.some(f=>f.code==='http_redirect_loop'));
});
test('Netlify: multiple redirect aliases do not manufacture duplicate documents',()=>{
 const final='https://nimble-monstera-795cd4.netlify.app/target';
 const reports=[301,302,307,308].map(code=>report('https://nimble-monstera-795cd4.netlify.app/redirect-'+code,final));
 assert.equal(uniqueFinalPages(reports).length,1);
});
test('navigation timeout is not scored or treated as completed',()=>{
 const url='https://badseo.dev/redirect/loop';
 const coverage=auditCoverage([url],[],[{url,error:'navigation timed out',httpEvidence:observed(null,{},[{url,status:301,location:url}])}]);
 assert.equal(coverage.uniqueFinalPages,0);
 assert.equal(coverage.complete,0);
 assert.equal(coverage.failed,1);
});
