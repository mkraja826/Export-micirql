import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectSeoHtml as serverInspector} from '../src/seo-inspector.js';
import {inspectSeoHtml as browserInspector} from '../public/tools/seo/inspector.js';

test('browser and server inspectors remain identical',()=>{
 const source=readFileSync(new URL('../src/seo-inspector.js',import.meta.url),'utf8');
 const browser=readFileSync(new URL('../public/tools/seo/inspector.js',import.meta.url),'utf8');
 assert.equal(browser,source,'Sync browser inspector after modifying the shared SEO logic');
});

test('browser SEO inspector produces the same findings as server',()=>{
 const html='<html lang="en"><head><title>Sample</title><meta name="description" content="Page"><meta name="viewport" content="width=device-width"></head><body><h1>Welcome</h1></body></html>';
 const url='https://example.com/';
 assert.deepEqual(browserInspector(html,url),serverInspector(html,url));
 assert.ok(browserInspector(html,url).findings.some(x=>x.code==='missing_canonical'));
});

test('browser SEO inspector enforces the size limit',()=>{
 assert.throws(()=>browserInspector('x'.repeat(1000001),'https://example.com/'),/under 1 MB/);
});

test('SEO Studio offers a bounded browser-first multi-page audit',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/id="site-run"/);
 assert.match(page,/id="site-progress"/);
 assert.match(page,/id="site-export"/);
 assert.match(page,/MICIRQL_DISCOVER_RESULT/);
 assert.match(page,/MICIRQL_SEO_RESULT/);
 assert.match(page,/\.slice\(0,maxPages\)/);
 assert.match(page,/failures\.push/);
 assert.match(page,/siteExport\.disabled=false/);
});

test('multi-page SEO report records cross-page duplicate metadata without altering page scores',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/duplicate_title/);
 assert.match(page,/duplicate_description/);
 assert.match(page,/duplicate_canonical/);
 assert.match(page,/affectedUrls:urls/);
 assert.match(page,/reports,siteFindings,/);
 assert.match(page,/report\.partial\|\|report\.auditStatus!=='complete'/);
});

test('site audit provides accessible expandable page-level findings',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/document\.createElement\('details'\)/);
 assert.match(page,/document\.createElement\('summary'\)/);
 assert.match(page,/panel\.dataset\.severity/);
 assert.match(page,/report\.findings\]\.sort/);
 assert.match(page,/report\.scoreExplanation/);
});

test('site audit labels page roles without changing individual SEO scores',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/function suggestedPageRole\(url\)/);
 assert.match(page,/pageRoleSource='suggested_from_url'/);
 assert.match(page,/groups\[p\.pageRole\]/);
 assert.match(page,/Roles are editable suggestions/);
});

test('site audit permits overriding page roles and recalculates group averages',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/function refreshRoleSummary\(\)/);
 assert.match(page,/siteReport\.roleSummary=/);
 assert.match(page,/roleSelect\.addEventListener\('change'/);
 assert.match(page,/pageRoleSource='user_override'/);
 assert.match(page,/roleSelect\.setAttribute\('aria-label'/);
});

test('site issue center groups findings by severity and affected URLs',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/id='site-issue-filter'/);
 assert.match(page,/siteReport\.issueCenter=issues/);
 assert.match(page,/affectedUrls:\[\.\.\.new Set\(issue\.affectedUrls\)\]/);
 assert.match(page,/severityFilter\.addEventListener\('change',renderIssues\)/);
});

test('site report offers readable export with affected URLs and recommendations',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/id="site-export-text"/);
 assert.match(page,/siteExportText\.addEventListener\('click'/);
 assert.match(page,/siteReport\.reportNotes=/);
 assert.match(page,/issue\.recommendation/);
 assert.match(page,/siteReport\.failures\.map/);
});

test('site audit distinguishes selected-page coverage from entire-site completeness',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/successfulPercent:Math\.round\(reports\.length\/pages\.length\*100\)/);
 assert.match(page,/discoveryTruncated:discovered\.truncated===true/);
 assert.match(page,/selectionLimited:discovered\.pages\.length>pages\.length/);
 assert.match(page,/Unvisited pages are not scored/);
 assert.match(page,/siteReport\.coverage\.successfulPercent/);
});

test('site audit retries failed page inspections at most twice and preserves failures',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/attempt<=2/);
 assert.match(page,/report\.attempts=attempt/);
 assert.match(page,/retryPolicy:\{maxAttemptsPerPage:2,sequential:true\}/);
 assert.match(page,/if\(lastError\)failures\.push/);
 assert.match(page,/siteProgress\.value=i\+1/);
});

test('SEO audit resumes previously completed pages from a bounded local checkpoint',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/micirql-seo-checkpoint-v1/);
 assert.match(page,/Date\.now\(\)-saved\.savedAt>86400000/);
 assert.match(page,/cached\.has\(pages\[i\]\)/);
 assert.match(page,/saveCheckpoint\(url\.origin,pages,reports\)/);
 assert.match(page,/localStorage\.removeItem\(checkpointKey\)/);
});

test('SEO site audit offers bounded selectable batch sizes',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/id="site-limit"/);
 for(const size of [10,20,40,60])assert.match(page,new RegExp('<option value="'+size+'"'));
 assert.match(page,/if\(!\[10,20,40,60\]\.includes\(maxPages\)\)/);
 assert.match(page,/requestedLimit:maxPages/);
});

test('SEO audit caps browser-local batches and checkpoints at 60 pages',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/saved\.reports\.length>60/);
 assert.match(page,/id="site-progress" max="60"/);
 assert.match(page,/up to 60 same-origin pages/);
});

test('SEO page discovery supports user-selected URLs within the 60-page limit',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/id="site-discover"/);
 assert.match(page,/id="site-page-list"/);
 assert.match(page,/id="site-all"/);
 assert.match(page,/id="site-none"/);
 assert.match(page,/selectedDiscovery\.selected\.size>=limit/);
 assert.match(page,/selectedDiscovery\.pages\.filter\(p=>selectedDiscovery\.selected\.has\(p\)\)\.slice\(0,maxPages\)/);
 assert.match(page,/\.slice\(0,60\)/);
});

test('SEO discovered-page selector supports search, page-type filters and count',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/id="site-page-search"/);
 assert.match(page,/id="site-page-role"/);
 assert.match(page,/id="site-selected-count"/);
 assert.match(page,/suggestedPageRole\(p\)===role/);
 assert.match(page,/site-page-search'\)\.addEventListener\('input',renderSelection\)/);
});

test('large-site discovery uses a longer timeout than individual page inspection',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/MICIRQL_DISCOVER_RESULT',url\.href,600000/);
 assert.match(page,/MICIRQL_SEO_RESULT',pages\[i\],90000/);
});
