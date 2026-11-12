import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseSecurityPages,assessSecurityResponse,buildSecurityReport,
 SECURITY_PAGE_SAMPLE_LIMIT,SECURITY_ALLOWED_HEADERS} from '../public/tools/security/analyzer.js';
const website='https://security.example/';
const observed=(headers={},status=200)=>({ok:true,observed:true,url:website,status,headers});
const result=(o,requestedUrl=website)=>assessSecurityResponse({requestedUrl,observation:o});
test('selects at most 3 unique safe same-origin public pages, preferring contact',()=>{
 const pages=chooseSecurityPages([website+'blog',website+'contact',website+'about',
  website+'login',website+'logout',website+'api/status',website+'download.pdf',
  'https://other.example/',website+'contact#fragment'],website);
 assert.deepEqual(pages.selectedPages,[website,website+'contact',website+'blog']);
 assert.equal(pages.discoveredCandidatePages,4);
 assert.equal(pages.selectionLimited,true);
 assert.equal(SECURITY_PAGE_SAMPLE_LIMIT,3);
 assert.throws(()=>chooseSecurityPages([],website,60),/1–3/);
});
test('rejects private IP/local host, credentials, local schemes and action routes',()=>{
 for(const site of ['http://localhost/','http://127.0.0.1/','https://192.168.1.9/',
  'https://[::1]/','http://server.local/','https://someone.internal/',
  'https://name:pass@security.example/','file:///etc/passwd',
  website+'logout',website+'checkout']){
  assert.throws(()=>chooseSecurityPages([],site),/public website/);
 }
});
test('observed HTTPS and supplied header policies remain contextual evidence, not grades',()=>{
 const response=observed({
  'strict-transport-security':'max-age=31536000; includeSubDomains',
  'content-security-policy':"default-src 'self'; frame-ancestors 'none'",
  'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=()',
  'server':'secret-backend',cookie:'private'
 });
 const data=result(response);
 assert.equal(data.state,'observed');
 assert.equal(data.checks.find(x=>x.code==='framing').state,'observed');
 assert.equal(data.checks.find(x=>x.code==='hsts').state,'observed');
 assert.equal(data.checks.find(x=>x.code==='nosniff').state,'observed');
 assert.equal(data.checks.find(x=>x.code==='permissions').state,'observed');
 assert.ok(!('server' in data.headers));
 assert.ok(!('cookie' in data.headers));
 assert.equal(SECURITY_ALLOWED_HEADERS.length,7);
 assert.ok(!('score' in data));
});
test('HSTS max-age=0 and invalid HSTS are review candidates rather than protective evidence',()=>{
 const zero=result(observed({'strict-transport-security':'max-age=0'}));
 const invalid=result(observed({'strict-transport-security':'includeSubDomains'}));
 assert.equal(zero.checks.find(x=>x.code==='hsts').state,'review');
 assert.equal(invalid.checks.find(x=>x.code==='hsts').state,'review');
 assert.match(zero.checks.find(x=>x.code==='hsts').detail,/disables HSTS persistence/);
});
test('missing optional policies create review candidates, not proven vulnerabilities',()=>{
 const data=result(observed({}));
 assert.equal(data.state,'observed');
 assert.equal(data.checks.find(x=>x.code==='csp').state,'review');
 assert.equal(data.checks.find(x=>x.code==='permissions').state,'review');
 assert.equal(data.checks.find(x=>x.code==='framing').state,'review');
 assert.equal(data.checks.find(x=>x.code==='coop').state,'informational');
 assert.ok(data.checks.every(x=>!['vulnerability','critical'].includes(x.state)));
});
test('CSP frame-ancestors substitutes for X-Frame-Options, and HTTP HSTS not applicable',()=>{
 const framed=result(observed({'content-security-policy':"frame-ancestors 'self'"}));
 assert.equal(framed.checks.find(x=>x.code==='framing').state,'observed');
 const httpResult=result({ok:true,observed:true,url:'http://security.example/',status:200,
  headers:{'strict-transport-security':'max-age=31536000'}},'http://security.example/');
 assert.equal(httpResult.checks.find(x=>x.code==='hsts').state,'not_applicable');
 assert.equal(httpResult.checks.find(x=>x.code==='https_scheme').state,'review');
});
test('redirects, HTTP errors, unsupported responses and timeouts are not scanned as successful pages',()=>{
 const moved=result({ok:true,observed:true,url:website,status:301,location:'/new',
  headers:{'strict-transport-security':'max-age=31536000'}});
 assert.equal(moved.state,'redirect');assert.equal(moved.status,301);assert.deepEqual(moved.checks,[]);
 const blocked=result(observed({},403));assert.equal(blocked.state,'http_error');
 assert.equal(blocked.checks.length,0);
 const timeout=result({ok:true,observed:false,status:null,reason:'timeout'});
 assert.equal(timeout.state,'unverified');assert.equal(timeout.status,null);
 const opaque=result({ok:true,observed:false,status:0,reason:'response_not_exposed'});
 assert.equal(opaque.state,'unverified');
});
test('rejects spoofed final URLs and refuses cross-origin observations',()=>{
 const bad=result({ok:true,observed:true,url:'https://other.example/',status:200,headers:{}});
 assert.equal(bad.state,'unverified');assert.equal(bad.reason,'unexpected_response_url');
 assert.throws(()=>buildSecurityReport({website,observations:[
  {requestedUrl:'https://other.example/',response:observed({})}]}),/unsafe/);
});
test('aggregates verified checks separately from unverified or redirected pages',()=>{
 const pageB=website+'contact',pageC=website+'services';
 const data=buildSecurityReport({website,discoveredPages:15,discoveryTruncated:true,observations:[
  {requestedUrl:website,response:observed({'x-content-type-options':'nosniff'})},
  {requestedUrl:pageB,response:{ok:true,observed:true,url:pageB,status:302,location:'/new'}},
  {requestedUrl:pageC,response:{ok:false,observed:false,reason:'network_unverified'}}
 ]});
 assert.deepEqual({sampled:data.scope.sampledPages,observed:data.scope.observedResponses,
  redirected:data.scope.redirectsNotFollowed,unverified:data.scope.unverified},{sampled:3,observed:1,redirected:1,unverified:1});
 assert.equal(data.scope.selectionLimited,true);
 assert.equal(data.summary.observedHeaderChecks,1);
 assert.ok(data.summary.reviewCandidates>=3);
 assert.ok(data.limitations.some(x=>x.includes('no vulnerability exploitation')));
 assert.ok(!('score' in data));
});
test('no duplicate or extra samples allowed',()=>{
 const row={requestedUrl:website,response:observed({})};
 assert.throws(()=>buildSecurityReport({website,observations:[row,row]}),/duplicate/);
 assert.throws(()=>buildSecurityReport({website,observations:Array(4).fill(row)}),/Too many/);
});
test('Security Studio uses trusted extension observation and PDF, not server-side scanning',()=>{
 const app=readFileSync(new URL('../public/tools/security/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/tools/security/index.html',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
 assert.match(app,/MICIRQL_SECURITY_HEADERS/);
 assert.match(app,/chooseSecurityPages/);
 assert.match(app,/window\.print\(\)/);
 assert.match(bridge,/READ_SECURITY_HEADERS/);
 assert.match(bridge,/security-headers/);
 assert.match(worker,/credentials:'omit'/);
 assert.match(worker,/redirect:'manual'/);
 assert.match(worker,/response\.body\?\.cancel\(\)/);
 assert.match(html,/Print \/ Save PDF report/);
 assert.doesNotMatch(app,/\/api\/security|\/api\/screenshot/);
});
