import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseAuditedPages,normalizeLinkTarget,buildLinkAudit,summarizeSitemapEvidence,
 LINK_AUDIT_PAGE_LIMIT,LINK_AUDIT_DESTINATION_LIMIT} from '../public/tools/links/analyzer.js';
const root='https://audit.example/';
const page=(name,targets=[],extra={})=>({url:root+name,complete:true,targets,...extra});
test('page discovery is bounded to 60 unique same-origin HTTP(S) pages',()=>{
 const urls=Array.from({length:80},(_,i)=>root+'page-'+i);
 const chosen=chooseAuditedPages([root,'https://evil.example/',root+'#top',...urls],root);
 assert.equal(chosen.length,60);
 assert.equal(chosen[0],root);
 assert.ok(chosen.every(url=>new URL(url).origin===new URL(root).origin));
 assert.throws(()=>chooseAuditedPages(urls,root,61),/1–60/);
 assert.equal(LINK_AUDIT_PAGE_LIMIT,60);
 assert.equal(LINK_AUDIT_DESTINATION_LIMIT,60);
});
test('fragments deduplicated and dangerous non-http schemes rejected',()=>{
 assert.equal(normalizeLinkTarget('/service#book',root),root+'service');
 assert.equal(normalizeLinkTarget('javascript:alert(1)',root),null);
 assert.equal(normalizeLinkTarget('mailto:help@example.com',root),null);
 assert.equal(normalizeLinkTarget('https://user:password@audit.example/',root),null);
});
test('only verified status 404/410 is counted broken and referrers deduplicate',()=>{
 const a=root+'broken',b=root+'missing',c=root+'offline',d=root+'timeout',e=root+'ok';
 const report=buildLinkAudit({website:root,pages:[
  page('',[a,a,b,c,d,e,'https://external.example/a','javascript:void(0)']),
  page('about',[a,e]),page('partial',[root+'not-trusted'],{complete:false,reason:'capture timeout'})
 ],diagnostics:[
  {destination:a,ok:true,status:404,finalUrl:a},
  {destination:b,ok:true,status:410},
  {destination:c,ok:true,status:503},
  {destination:d,ok:false,status:404,reason:'timeout'},
  {destination:e,ok:true,status:301,finalUrl:root+'ok-new'}
 ]});
 assert.deepEqual(report.summary,{broken:2,serverErrors:1,reachable:1,unverified:1,notChecked:0});
 assert.equal(report.scope.completePages,2);
 assert.equal(report.scope.unverifiedPages,1);
 assert.equal(report.scope.uniqueInternalDestinations,5);
 assert.deepEqual(report.links.find(x=>x.destination===a).referringPages,[root,root+'about']);
 assert.equal(report.links.find(x=>x.destination===d).status,null);
 assert.equal(report.links.find(x=>x.destination===e).finalUrl,root+'ok-new');
 assert.equal(report.links.find(x=>x.destination===root+'not-trusted'),undefined);
 assert.equal(report.sitemap.state,'unverified');
});
test('unchecked destinations stay unchecked and are never assumed reachable',()=>{
 const target=root+'service';
 const report=buildLinkAudit({website:root,pages:[page('',[target])],diagnostics:[]});
 assert.equal(report.summary.notChecked,1);
 assert.equal(report.summary.broken,0);
 assert.equal(report.scope.destinationSelectionLimited,true);
 assert.equal(report.links[0].classification,'not_checked');
});
test('only same-origin sitemap URL locations are retained',()=>{
 const s=summarizeSitemapEvidence({observed:true,status:200,body:
  '<urlset><url><loc>https://audit.example/a&amp;b=1</loc></url><url><loc>https://audit.example/b#top</loc></url><url><loc>https://other.example/out</loc></url></urlset>'},root);
 assert.equal(s.state,'checked');assert.equal(s.listedCount,3);assert.equal(s.externalCount,1);
 assert.deepEqual(s.urls,[root+'a&b=1',root+'b']);
});
test('sitemap missing, blocked and truncated remain explicit independent outcomes',()=>{
 assert.equal(summarizeSitemapEvidence({observed:true,status:404},root).state,'not_found');
 assert.equal(summarizeSitemapEvidence({observed:true,status:503},root).state,'unverified');
 assert.equal(summarizeSitemapEvidence({observed:true,status:200,truncated:true,body:'<urlset/>'},root).state,'unverified');
 assert.equal(summarizeSitemapEvidence({observed:true,status:200,body:'<html>not a sitemap</html>'},root).state,'needs_review');
 assert.equal(summarizeSitemapEvidence({observed:false,status:null},root).state,'unverified');
});
test('report preserves strict 60-page limit and does not mutate source arrays',()=>{
 const pages=Array.from({length:60},(_,i)=>page('p'+i,[root+'ok']));
 const before=JSON.stringify(pages);
 const summary=buildLinkAudit({website:root,pages,diagnostics:[]});
 assert.equal(summary.scope.selectedPages,60);
 assert.equal(JSON.stringify(pages),before);
 assert.throws(()=>buildLinkAudit({website:root,pages:[...pages,page('p61')]}),/Too many audited pages/);
});
test('standalone beta uses trusted extension messages, printable report and no remote crawl API',()=>{
 const html=readFileSync(new URL('../public/tools/links/index.html',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/tools/links/app.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
 assert.match(html,/Link & Sitemap Inspector/);assert.match(html,/window\.print/ .source ? /Print \/ Save PDF report/:/Print \/ Save PDF report/);
 assert.match(client,/MICIRQL_DISCOVER/);
 assert.match(client,/MICIRQL_SEO_READ/);
 assert.match(client,/MICIRQL_SEO_LINK_CHECK/);
 assert.match(client,/MICIRQL_LINK_SITEMAP/);
 assert.match(client,/window\.print\(\)/);
 assert.match(bridge,/READ_LINK_SITEMAP/);
 assert.match(worker,/readSitemapEvidence/);
 assert.doesNotMatch(client,/\/api\/discover|\/api\/screenshot/);
});
