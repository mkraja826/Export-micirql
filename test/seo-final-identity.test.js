import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueFinalPages,auditCoverage,httpEvidenceCoverage} from '../public/tools/seo/audit-lifecycle.js';

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
 assert.deepEqual(httpEvidenceCoverage(pages),{analyzed:2,observed:1,unverified:1,percent:50});
});
test('HTTP evidence coverage for missing evidence stays zero, not verified',()=>{
 const pages=[page('https://badseo.dev/status/not-found','https://badseo.dev/status/not-found')];
 assert.equal(httpEvidenceCoverage(pages).observed,0);
});
