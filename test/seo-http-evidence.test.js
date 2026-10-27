import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretHttpEvidence} from '../public/tools/seo/http-evidence.js';
const observe=(status,headers={})=>({observed:true,status,headers,finalUrl:'https://example.org/page'});
test('unobserved status remains unverified',()=>{const r=interpretHttpEvidence({observed:false,status:null},'','https://example.org/');assert.equal(r.verified,false);assert.equal(r.findings.length,0)});
test('BadSEO 404 and 429 cases yield evidence-backed errors',()=>{
 assert.ok(interpretHttpEvidence(observe(404)).findings.some(f=>f.code==='http_not_found'));
 assert.ok(interpretHttpEvidence(observe(429)).findings.some(f=>f.code==='http_rate_limited'));
});
test('BadSEO header noindex is detected',()=>{
 const r=interpretHttpEvidence(observe(200,{'x-robots-tag':'noindex, nofollow'}));
 assert.ok(r.findings.some(f=>f.code==='http_noindex'));
});
test('TestingURL HTML and HTTP canonical conflict is detected',()=>{
 const r=interpretHttpEvidence(observe(200,{link:'<https://example.org/other>; rel="canonical"'}),'https://example.org/page','https://example.org/page');
 assert.ok(r.findings.some(f=>f.code==='http_canonical_conflict'));
});
test('matching canonical and healthy status do not generate false errors',()=>{
 const r=interpretHttpEvidence(observe(200,{link:'<https://example.org/page>; rel="canonical"'}),'https://example.org/page','https://example.org/page');
 assert.equal(r.findings.length,0);
});

test('Netlify or TestingURL observed redirect hops are retained and long chains reported',()=>{
 const evidence={...observe(200),redirects:[
  {url:'https://example.org/a',status:301,location:'/b'},
  {url:'https://example.org/b',status:302,location:'/c'},
  {url:'https://example.org/c',status:307,location:'/final'}
 ]};
 const result=interpretHttpEvidence(evidence,'','https://example.org/final');
 assert.equal(result.redirects.length,3);
 assert.ok(result.findings.some(f=>f.code==='http_redirect_chain'&&f.evidence.length===3));
});
test('a single observed redirect does not trigger long chain finding',()=>{
 const result=interpretHttpEvidence({...observe(200),redirects:[{url:'https://example.org/a',status:301,location:'/b'}]});
 assert.equal(result.redirects.length,1);
 assert.equal(result.findings.some(f=>f.code==='http_redirect_chain'),false);
});

test('observed circular redirects are detected only with a closing Location edge',()=>{
 const cyclic={...observe(200),redirects:[
  {url:'https://example.org/a',status:301,location:'/b'},
  {url:'https://example.org/b',status:302,location:'/a'}
 ]};
 assert.ok(interpretHttpEvidence(cyclic).findings.some(f=>f.code==='http_redirect_loop'));
 const linear={...observe(200),redirects:[
  {url:'https://example.org/a',status:301,location:'/b'},
  {url:'https://example.org/b',status:302,location:'/c'}
 ]};
 assert.equal(interpretHttpEvidence(linear).findings.some(f=>f.code==='http_redirect_loop'),false);
});
