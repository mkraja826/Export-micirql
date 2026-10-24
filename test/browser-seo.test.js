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
 assert.match(page,/\.slice\(0,20\)/);
 assert.match(page,/failures\.push/);
 assert.match(page,/siteExport\.disabled=false/);
});

test('multi-page SEO report records cross-page duplicate metadata without altering page scores',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/duplicate_title/);
 assert.match(page,/duplicate_description/);
 assert.match(page,/duplicate_canonical/);
 assert.match(page,/affectedUrls:urls/);
 assert.match(page,/reports,siteFindings,scope/);
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
 assert.match(page,/p\.pageRole==='public'/);
 assert.match(page,/Page roles are URL-based suggestions/);
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
