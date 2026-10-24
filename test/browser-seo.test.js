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
 assert.match(page,/micirql-seo-checkpoint-v2/);
 assert.match(page,/Date\.now\(\)-saved\.savedAt>86400000/);
 assert.match(page,/cached\.has\(pages\[i\]\)/);
 assert.match(page,/saveCheckpoint\(url\.origin,pages,reports\)/);
 assert.match(page,/if\(!failures\.length\)try\{localStorage\.removeItem\(checkpointKey\)\}/);
});

test('SEO site audit offers bounded selectable batch sizes',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/id="site-limit"/);
 for(const size of [10,20,40,60])assert.match(page,new RegExp('<option value="'+size+'"'));
 assert.match(page,/if\(!\[10,20,40,60\]\.includes\(limit\)\)/);
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

test('SEO rediscovery invalidates stale start URLs and prevents overlapping audits',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/startUrl:url\.href/);
 assert.match(page,/selectedDiscovery\.startUrl!==url\.href/);
 assert.match(page,/discoverButton\.disabled=true;siteButton\.disabled=true/);
 assert.match(page,/siteButton\.disabled=true;discoverButton\.disabled=true/);
 assert.match(page,/siteButton\.disabled=false;discoverButton\.disabled=false/);
});

test('SEO discovery timeout refreshes on real extension progress with hard safety limit',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/MICIRQL_DISCOVER_PROGRESS/);
 assert.match(page,/hardLimit=1800000/);
 assert.match(page,/if\(progressType&&event\.data\.type===progressType\)/);
 assert.match(page,/resetTimer\(\);return/);
 assert.match(page,/Extension stopped responding/);
});

test('extension prevents overlapping discovery operations across SEO Studio tabs',()=>{
 const background=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
 assert.match(background,/let discoveryBusy=false/);
 assert.match(background,/if\(discoveryBusy\)/);
 assert.match(background,/discoveryBusy=true/);
 assert.match(background,/finally\(\(\)=>\{discoveryBusy=false\}\)/);
});

test('partial SEO audits retain successful page checkpoints for targeted retry',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/if\(!failures\.length\)try\{localStorage\.removeItem\(checkpointKey\)\}/);
 assert.match(page,/cached\.has\(pages\[i\]\)/);
 assert.match(page,/saveCheckpoint\(url\.origin,pages,reports\)/);
});

test('SEO checkpoint matches requested URLs even when inspection redirects',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/report\.requestedUrl=pages\[i\]/);
 assert.match(page,/r\.requestedUrl\|\|r\.url/);
 assert.match(page,/const resumedCount=pages\.filter\(p=>cached\.has\(p\)\)\.length/);
 assert.match(page,/Rerun this selection to retry failed pages using saved results/);
});

test('coverage note does not misrepresent manually selected pages as first discovered pages',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/discovered pages were selected for this audit/);
 assert.doesNotMatch(page,/Only the first '\+pages\.length/);
});

test('SEO page retries include a bounded recovery pause',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/if\(attempt<2\)\{siteStatus\.textContent=/);
 assert.match(page,/setTimeout\(resolve,1500\)/);
 assert.match(page,/attempt<=2/);
});

test('select-all respects current search and page-type filters without dropping prior selections',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/const visible=selectedDiscovery\.pages\.filter/);
 assert.match(page,/\.\.\.selectedDiscovery\.selected,\.\.\.visible/);
 assert.match(page,/\.slice\(0,chosenLimit\(\)\)/);
});

test('SEO Studio inline module parses, so extension connection detection can initialize',async()=>{
 const {Script}=await import('node:vm');
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const source=page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(source,'SEO Studio module should be present');
 assert.doesNotThrow(()=>new Script(source.replace(/^import\s+[^\n]+\n/gm,'')));
});

test('cross-page canonical grouping resolves relative URLs and ignores trailing slash',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/new URL\(report\[field\],report\.url\)/);
 assert.match(html,/c\.hash=''/);
 assert.match(html,/c\.pathname=c\.pathname\.replace/);
});

test('SEO issue dashboard supports mobile-friendly finding and URL search',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/site-issue-search/);
 assert.match(html,/issueSearch\.addEventListener\('input',renderIssues\)/);
 assert.match(html,/item\.affectedUrls/);
 assert.match(html,/#site-results summary\{overflow-wrap:anywhere\}/);
});

test('site SEO dashboard exposes transparent audit coverage and severity overview',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/id='site-audit-overview'/);
 assert.match(html,/Public HTML average/);
 assert.match(html,/High-priority groups/);
 assert.match(html,/completeScoredPages:eligible.length/);
 assert.match(html,/siteResults.prepend\(overview\)/);
});

test('SEO triage does not pretend to measure search traffic impact',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/Investigate first/);
 assert.match(html,/Review next/);
 assert.match(html,/Lower priority/);
 assert.match(html,/issue\.fixScope=sameElement/);
 assert.match(html,/issue\.triageReason=/);
 assert.match(html,/siteReport\.issueCenter=issues/);
});

test('SEO issue center includes safe remediation and verification steps',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/const fixDetails=/);
 assert.match(html,/issue\.fixGuide=details/);
 assert.match(html,/How to fix and verify/);
 assert.match(html,/verificationRequired:true/);
 assert.match(html,/code\.textContent=issue\.fixGuide\.example/);
});

test('SEO link verifier has bounded workers, pause, local checkpoint and CSV export',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/micirql-seo-link-check-v2:/);
 assert.match(html,/Promise\.all\(\[worker\(\),worker\(\)\]\)/);
 assert.match(html,/Pause verification/);
 assert.match(html,/Start \/ resume verification/);
 assert.match(html,/Download link CSV/);
 assert.match(html,/stop=true/);
 assert.match(html,/siteReport\.linkVerification=\[\.\.\.completed\.values\(\)\]/);
});

test('verified link dashboard supports text search, status filtering, and safe rendering',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/Search verified links/);
 assert.match(html,/Filter link status/);
 assert.match(html,/entry\.classification!==filter\.value/);
 assert.match(html,/td\.textContent=String\(value\)/);
 assert.match(html,/Use CSV for complete results/);
});

test('verified HTTP errors are grouped by referring page without treating unverified links as broken',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('Affected source pages (verified errors)'));
 assert.ok(html.includes("['broken','server_error'].includes(entry.classification)"));
 assert.ok(html.includes('for(const page of entry.referringPages||[])'));
 assert.ok(html.includes('ordered.slice(0,30)'));
});

test('unverified destination retry control preserves confirmed HTTP results',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('Retry unverified checks'));
 assert.ok(html.includes("if(row.classification==='unverified')completed.delete(destination)"));
 assert.ok(html.includes('retryButton.disabled=running||uncertain===0'));
 assert.ok(html.includes("+' unverified. Network failures can be retried.'"));
});

test('authentication routes are classified as application and waive inappropriate indexability penalties',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('forgot-password|reset-password|password-reset'));
 assert.ok(html.includes('report.contextualFindings=excluded.map'));
 assert.ok(html.includes("['noindex','missing_canonical'].includes(item.code)"));
 assert.ok(html.includes('report.score=Math.min(100,report.score+waived)'));
});

test('heading hierarchy issue center renders exact transitions safely',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("issue.code==='heading_hierarchy'&&issue.pageEvidence?.length"));
 assert.ok(html.includes("item.element==='heading'&&item.from&&item.to"));
 assert.ok(html.includes("description.textContent=item.from+' → '+item.to"));
 assert.ok(html.includes("source.textContent='Page: '+page.url"));
});

test('text export explains page-role score adjustments and absent HTTP verification',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("Page-role scoring:"));
 assert.ok(html.includes("Contextual findings (not deducted from score): "));
 assert.ok(html.includes("HTTP link verification: "));
 assert.ok(html.includes("not performed or no results saved"));
});

test('site overview averages public pages separately from application and legal pages',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const publicEligible=eligible.filter(p=>p.pageRole==='public')"));
 assert.ok(html.includes("'Public HTML average'"));
 assert.ok(html.includes("averageScope:'public_pages_only'"));
 assert.ok(html.includes("publicScoredPages:publicEligible.length"));
});

test('SEO checkpoint invalidates old scoring versions without losing retry feature',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const checkpointKey='micirql-seo-checkpoint-v2'"));
 assert.ok(!html.includes("const checkpointKey='micirql-seo-checkpoint-v1'"));
 assert.ok(html.includes('const checkpoint=readCheckpoint(url.origin)'));
 assert.ok(html.includes('saveCheckpoint(url.origin,pages,reports)'));
});

test('TXT audit export includes exact heading transition evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("lines.push('','Heading hierarchy evidence:')"));
 assert.ok(html.includes("item.element==='heading'&&item.from&&item.to"));
 assert.ok(html.includes("heading.from+' → '+heading.to"));
 assert.ok(html.includes("heading.previousText||'(empty)'"));
 assert.ok(html.includes("heading.currentText||'(empty)'"));
});

test('SEO Studio provides responsive overview and searchable audited-page results',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("pageDashboard.id='site-page-dashboard'"));
 assert.ok(html.includes("pageSearch.addEventListener('input',renderPageRows)"));
 assert.ok(html.includes("pageRoleFilter.addEventListener('change',renderPageRows)"));
 assert.ok(html.includes("pageCount.textContent=visible+' of '+reports.length"));
 assert.ok(html.includes("page.score===null?'Not scored':page.score+'/100'"));
 assert.ok(html.includes('#site-page-dashboard .table-scroll{overflow-x:auto}'));
});

test('SEO issues dashboard shows grouped severity and actionable evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("issueDashboard.id='site-issue-dashboard'"));
 assert.ok(html.includes("issuePulse.className='issue-pulse'"));
 assert.ok(html.includes("issueContainer.id='site-issues'"));
 assert.ok(html.includes("issueMeta.className='issue-meta'"));
 assert.ok(html.includes("issueNext.textContent='Suggested action: '+issue.recommendation"));
 assert.ok(html.includes("Counts represent grouped HTML findings"));
});

test('technical SEO overview filters the existing issue center',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("technicalOverview.id='site-technical-overview'"));
 assert.ok(html.includes("technicalGrid.className='technical-grid'"));
 assert.ok(html.includes("['Metadata','metadata']"));
 assert.ok(html.includes("['Indexability','indexability']"));
 assert.ok(html.includes("['Content & headings','content']"));
 assert.ok(html.includes("['Structured data','structured_data']"));
 assert.ok(html.includes("['Links','links']"));
 assert.ok(html.includes("control.addEventListener('click'"));
 assert.ok(html.includes("renderIssues();issueContainer.scrollIntoView"));
});

test('SEO audit history stays local and compares public scores',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("historyKey='micirql-seo-history-v1:'+siteReport.website"));
 assert.ok(html.includes("previousHistory.at(-1)"));
 assert.ok(html.includes("mean-latest.score"));
 assert.ok(html.includes("previousHistory=[...previousHistory,snapshot].slice(-10)"));
 assert.ok(html.includes("localStorage.removeItem(historyKey)"));
 assert.ok(html.includes("Saved only in this browser."));
});
