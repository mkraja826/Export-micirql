import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueFinalPages,auditCoverage,httpEvidenceCoverage,crossPageMetadataFindings} from '../public/tools/seo/audit-lifecycle.js';

const page=(requestedUrl,url,title='Homepage')=>({requestedUrl,url,title,score:83,auditStatus:'complete',partial:false});

test('BadSEO redirect chain resolving to homepage counts one final document',()=>{
 const reports=[
  page('https://badseo.dev/','https://badseo.dev/'),
  page('https://badseo.dev/redirect/chain-1','https://badseo.dev/'),
 ];
 assert.equal(reports.length,2);
 assert.equal(uniqueFinalPages(reports).length,1);
});

test('Netlify 301, 302, 307, 308 aliases do not inflate duplicate metadata groups',()=>{
 const home='https://nimble-monstera-795cd4.netlify.app/redirect-destination.html';
 const reports=['redirect-301','redirect-302','redirect-307','redirect-308'].map(segment=>page('https://nimble-monstera-795cd4.netlify.app/'+segment,home));
 assert.equal(uniqueFinalPages(reports).length,1);
});

test('TestingURL repeated login captures count one final document',()=>{
 const url='https://testingurl.dev/scraping/auth/login';
 assert.equal(uniqueFinalPages([page(url,url),page(url,url),page(url,url)]).length,1);
});

test('different final documents retain separate identities, even with matching titles',()=>{
 const reports=[page('https://badseo.dev/a','https://badseo.dev/a'),page('https://badseo.dev/b','https://badseo.dev/b')];
 assert.equal(uniqueFinalPages(reports).length,2);
});

test('query strings and trailing slashes retain distinct final identities',()=>{
 const reports=[page('https://example.org/a','https://example.org/a'),page('https://example.org/a/','https://example.org/a/'),page('https://example.org/a?q=1','https://example.org/a?q=1')];
 assert.equal(uniqueFinalPages(reports).length,3);
});

test('partial or failed captures are excluded from cross-page duplicate analysis',()=>{
 const reports=[page('https://example.org/','https://example.org/'),{...page('https://example.org/other','https://example.org/other'),partial:true,auditStatus:'partial'}];
 assert.equal(uniqueFinalPages(reports).length,1);
});

test('coverage distinguishes selected URLs from distinct final pages',()=>{
 const reports=[
  page('https://badseo.dev/','https://badseo.dev/'),
  page('https://badseo.dev/redirect/chain-1','https://badseo.dev/')
 ];
 const coverage=auditCoverage(reports.map(r=>r.requestedUrl),reports,[]);
 assert.equal(coverage.selected,2);
 assert.equal(coverage.analyzed,2);
 assert.equal(coverage.uniqueFinalPages,1);
});

test('coverage keeps zero unique final pages for failed-only audits',()=>{
 const coverage=auditCoverage(['https://badseo.dev/redirect/loop'],[],[{url:'https://badseo.dev/redirect/loop',error:'Page load timed out'}]);
 assert.equal(coverage.selected,1);
 assert.equal(coverage.analyzed,0);
 assert.equal(coverage.failed,1);
 assert.equal(coverage.uniqueFinalPages,0);
});

test('HTTP evidence does not inherit HTML-only verified status',()=>{
 const pages=[
  {...page('https://badseo.dev/','https://badseo.dev/'),captureEvidence:{httpEvidence:{observed:false,status:null}}},
  {...page('https://badseo.dev/index/noindex-header','https://badseo.dev/index/noindex-header'),captureEvidence:{httpEvidence:{observed:true,status:200,headers:{'x-robots-tag':'noindex'}}}}
 ];
 assert.deepEqual(httpEvidenceCoverage(pages),{analyzed:2,observed:1,unverified:1,percent:50,reasons:{apiUnavailable:0,noResponseEvent:0,unknown:1}});
});
test('HTTP evidence coverage for missing evidence stays zero, not verified',()=>{
 const pages=[page('https://badseo.dev/status/not-found','https://badseo.dev/status/not-found')];
 assert.equal(httpEvidenceCoverage(pages).observed,0);
});

test('HTTP diagnostics distinguish missing API from missing response events',()=>{
 const reports=[
  {...page('https://badseo.dev/a','https://badseo.dev/a'),captureEvidence:{httpEvidence:{observed:false,status:null,observationState:'api_unavailable'}}},
  {...page('https://badseo.dev/b','https://badseo.dev/b'),captureEvidence:{httpEvidence:{observed:false,status:null,observationState:'no_response_event'}}}
 ];
 assert.deepEqual(httpEvidenceCoverage(reports).reasons,{apiUnavailable:1,noResponseEvent:1,unknown:0});
});

test('Score Accuracy V3.2: only complete indexable public pages form duplicate metadata groups',()=>{
 const make=(url,extra={})=>({url,requestedUrl:url,title:'Same metadata title',description:'Same metadata description',canonical:url,score:88,findings:[],pageRole:'public',auditStatus:'complete',partial:false,...extra});
 const a='https://example.com/a',b='https://example.com/b',privateUrl='https://example.com/login',legal='https://example.com/privacy',noindex='https://example.com/draft',partial='https://example.com/incomplete';
 const pages=[make(a),make(b),make(privateUrl,{pageRole:'application'}),make(legal,{pageRole:'legal'}),make(noindex,{findings:[{code:'http_noindex'}]}),make(partial,{partial:true,auditStatus:'partial'})];
 const before=pages.map(page=>page.score);
 const issues=crossPageMetadataFindings(pages);
 assert.deepEqual(issues.find(item=>item.code==='duplicate_title')?.affectedUrls,[a,b]);
 assert.deepEqual(issues.find(item=>item.code==='duplicate_description')?.affectedUrls,[a,b]);
 assert.ok(!issues.some(item=>item.affectedUrls.includes(privateUrl)||item.affectedUrls.includes(legal)||item.affectedUrls.includes(noindex)||item.affectedUrls.includes(partial)));
 assert.deepEqual(pages.map(page=>page.score),before,'Cross-page findings must not modify individual scores');
});
test('Score Accuracy V3.2: intentional canonicalized variants do not inflate title and description duplicate findings',()=>{
 const a='https://example.com/offer',b='https://example.com/offer?ref=mail',c='https://example.com/offer?ref=social';
 const make=(url,canonical)=>({url,requestedUrl:url,title:'Our services and offers',description:'Our latest offer details',canonical,score:92,findings:[],pageRole:'public',auditStatus:'complete',partial:false});
 const issues=crossPageMetadataFindings([make(a,a),make(b,a),make(c,a)]);
 assert.equal(issues.some(issue=>issue.code==='duplicate_title'||issue.code==='duplicate_description'),false);
 const shared=issues.find(issue=>issue.code==='duplicate_canonical');
 assert.equal(shared?.severity,'info');
 assert.equal(shared?.affectedUrls.length,3);
});
test('Score Accuracy V3.2: relative and slash-normalized canonical consolidation stays informational',()=>{
 const pages=[
  {url:'https://example.com/articles/a',canonical:'/articles/',title:'Article A',description:'First page',score:90,auditStatus:'complete'},
  {url:'https://example.com/articles/b',canonical:'https://example.com/articles',title:'Article B',description:'Second page',score:92,auditStatus:'complete'}
 ];
 const issues=crossPageMetadataFindings(pages);
 const issue=issues.find(item=>item.code==='duplicate_canonical');
 assert.equal(issue?.severity,'info');
 assert.deepEqual(issue?.affectedUrls,pages.map(page=>page.url));
 assert.ok(!issues.some(item=>item.code==='duplicate_title'||item.code==='duplicate_description'));
});
