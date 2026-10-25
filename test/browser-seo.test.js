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
 assert.match(page,/successfulPercent:measuredCoverage\.successfulPercent/);
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
 assert.match(page,/if\(!isDemo&&!failures\.length&&reports\.every\(/);
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
 assert.match(page,/siteButton\.disabled=true;demoButton\.disabled=true;discoverButton\.disabled=true/);
 assert.match(page,/siteButton\.disabled=false;demoButton\.disabled=false;discoverButton\.disabled=false/);
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
 assert.match(page,/if\(!isDemo&&!failures\.length&&reports\.every\(/);
 assert.match(page,/cached\.has\(pages\[i\]\)/);
 assert.match(page,/saveCheckpoint\(url\.origin,pages,reports\)/);
});

test('SEO checkpoint matches requested URLs even when inspection redirects',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/report\.requestedUrl=pages\[i\]/);
 assert.match(page,/reusablePages\(\{pages,reports:reusable\},url\.origin,pages\)/);
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
 assert.match(html,/Use CSV for all results/);
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
 assert.ok(html.includes("+' network failures). Network failures can be retried.'"));
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
 assert.ok(html.includes('const checkpoint=isDemo?null:readCheckpoint(url.origin)'));
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
 assert.ok(html.includes("issueNext.textContent='What to do: '+issue.recommendation"));
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

test('SEO audit history stores compact summaries under one namespace',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const historyKey='micirql-seo-history-v1:'+url.origin"));
 assert.equal((html.match(/const historyKey=/g)||[]).length,1);
 assert.ok(html.includes("auditHistory.slice(-10)"));
 assert.ok(html.includes("localStorage.removeItem(historyKey)"));
 assert.ok(html.includes("No page HTML is saved."));
});

test('audit comparisons use exact overlapping page URLs and retain issue codes',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('auditedUrls:reports.map(page=>page.url).sort()'));
 assert.ok(html.includes('const comparableUrls=oldUrls?new Set('));
 assert.ok(html.includes("issue.code+'|'+page"));
 assert.ok(html.includes('Different completed URL sets'));
});

test('large link result tables batch DOM work and report accurate filtered counts',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const fragment=document.createDocumentFragment()"));
 assert.ok(html.includes("if(matches>100)continue"));
 assert.ok(html.includes("rows.append(fragment)"));
 assert.ok(html.includes("Math.min(matches,100)+' of '+matches+' matching destinations ('"));
});

test('link verification tracks active requests and preserves timeout reasons in CSV',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('activeChecks=0'));
 assert.ok(html.includes('activeChecks++;refresh()'));
 assert.ok(html.includes("reason:reply.reason||null"));
 assert.ok(html.includes("row.reason='extension_error'"));
 assert.ok(html.includes("row.reason=error?.message?.includes('timed out')?'timeout':'request_failed'"));
 assert.ok(html.includes("' timeouts, '+requestFailed+' network failures"));
 assert.ok(html.includes("'Reason','Final URL'"));
});

test('SEO Studio V2 starts with website audit and keeps single-page inspection accessible',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('<h1>SEO Studio</h1>'));
 assert.ok(html.indexOf('id="site-heading"')>html.indexOf('id="advanced-inspector"'));
 assert.ok(html.includes('<details id="advanced-inspector"'));
 assert.ok(html.includes('class="panel audit-workspace"'));
 assert.ok(html.includes('aria-label="SEO Studio sections"'));
 assert.ok(html.includes("discovered.truncated===true?' Discovery was truncated"));
 assert.ok(!html.includes('Limited to first 20 discovered pages.'));
});

test('SEO Studio V2 keeps per-page evidence inside the searchable results table',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const pageEvidence=new Map()"));
 assert.ok(html.includes("['Page','Role','HTML score','Findings','Details']"));
 assert.ok(html.includes("const evidence=pageEvidence.get(page.url)"));
 assert.ok(html.includes("pageEvidence.set(report.url,panel)"));
 assert.ok(html.includes("detailsTitle.textContent='Inspect findings'"));
 assert.ok(html.includes("renderPageRows();\n  for(const failure"));
 assert.ok(!html.includes("siteResults.append(panel)"));
});


test('SEO Studio V2.3 navigates from each issue affected URL into page evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("pageJump.className='issue-page-jump'"));
 assert.ok(html.includes("pageJump.textContent='Inspect page: '+affected"));
 assert.ok(html.includes("pageSearch.value=affected;pageRoleFilter.value='all';renderPageRows();"));
 assert.ok(html.includes("pageDashboard.scrollIntoView({behavior:'smooth',block:'start'})"));
 assert.ok(html.includes("pageJump.setAttribute('aria-label','Show audit evidence for '+affected)"));
});


test('SEO Studio V2.3 uses readable issue titles, prioritizes fixes and folds technical details',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("missing_title:'Page title is missing'"));
 assert.ok(html.includes("summary.textContent=issueTitle(issue.code)"));
 assert.ok(html.includes("'What to do: '+issue.recommendation"));
 assert.ok(html.includes("'Why this was flagged: '+issue.message"));
 assert.ok(html.includes("technicalSummary.textContent='Technical details'"));
 assert.ok(html.includes("technicalEvidence.append(issueMeta)"));
});


test('SEO Studio V2.3 shows three severity-first actions and collapses category navigation',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("priorityPanel.id='site-fix-first'"));
 assert.ok(html.includes("const priorityOrder={high:0,medium:1,low:2,info:3}"));
 assert.ok(html.includes("(b.affectedUrls||[]).length-(a.affectedUrls||[]).length).slice(0,3)"));
 assert.ok(html.includes("issueSearch.value=issue.code;renderIssues()"));
 assert.ok(html.includes("document.createElement('details');technicalOverview.id='site-technical-overview'"));
 assert.ok(html.includes("if(!related.length)continue"));
});


test('SEO Studio V2.4 exports prioritized per-page action plan CSV safely',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("actionExport.id='site-action-export'"));
 assert.ok(html.includes("'Affected URL','Scope','Verification'"));
 assert.ok(html.includes("issue.affectedUrls.length?issue.affectedUrls:['']"));
 assert.ok(html.includes("safe.replace(/\"/g,'\"\"')"));
 assert.ok(html.includes("downloadReport('csv',lines.join("));
});


test('SEO Studio V2.4 offers a printable client summary without changing audit scores',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('id="site-export-pdf" disabled'));
 assert.ok(html.includes('sitePrintButton.disabled=false'));
 assert.ok(html.includes('function printClientSeoReport(report)'));
 assert.ok(html.includes('window.open(\'\',\'_blank\')'));
 assert.ok(html.includes('escapeHTML(issue.recommendation)'));
 assert.ok(html.includes('report.coverage?.discoveryTruncated'));
 assert.ok(html.includes('Average excludes incomplete and unscored pages.'));
});


test('SEO Studio V2.4 printed report includes score bands and full affected page appendix',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('const scoreBands=['));
 assert.ok(html.includes('valid.filter(page=>page.score>=80)'));
 assert.ok(html.includes('const issueAppendix=issues.flatMap('));
 assert.ok(html.includes('escapeHTML(page.url)'));
 assert.ok(html.includes('Affected page appendix'));
 assert.ok(html.includes('Audited page appendix'));
 assert.ok(html.includes('MiCirql SEO Studio</small>'));
});


test('SEO Studio V2.5 keeps bounded audit summaries and compares issue occurrences',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("micirql-seo-history-v1:"));
 assert.ok(html.includes("auditHistory.slice(-10)"));
 assert.ok(html.includes("affectedUrls.slice(0,100)"));
 assert.ok(html.includes("eligibleScores.length?Math.round("));
 assert.ok(html.includes('comparableUrls'));
 assert.ok(html.includes("No page HTML is saved."));
});


test('SEO Studio V2.5 plots score history and flags coverage differences in comparisons',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("chart.className='history-chart'"));
 assert.ok(html.includes("historySelect.id='site-history-compare'"));
 assert.ok(html.includes("historySelect.addEventListener('change',compareHistory)"));
 assert.ok(html.includes('comparableUrls'));
 assert.ok(html.includes('comparableUrls'));
});


test('SEO Studio V2.5 compares exact audited URLs and distinguishes recurring page issues',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('auditedUrls:reports.map(page=>page.url).sort()'));
 assert.ok(html.includes('oldUrls.size===currentUrls.size'));
 assert.ok(html.includes('const comparableUrls=oldUrls?new Set('));
 assert.ok(html.includes("['Newly observed',newly],['No longer observed',cleared],['Recurring',recurring]"));
 assert.ok(html.includes('Older audit did not store complete-page evidence'));
});


test('SEO Studio V2.5 permits exporting and deleting browser-local audit history',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("exportHistory.textContent='Export saved history (JSON)'"));
 assert.ok(html.includes("clearHistory.textContent='Delete saved history'"));
 assert.ok(html.includes("deleteSelected.textContent='Delete selected previous audit'"));
 assert.ok(html.includes("localStorage.removeItem(historyKey)"));
 assert.ok(html.includes("saved.splice(found,1)"));
 assert.ok(html.includes("historyControls.className='history-controls'"));
});


test('SEO Studio V2.6 health snapshot preserves scoring scope and audit coverage caveats',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("healthSummary.className='health-summary'"));
 assert.ok(html.includes("healthGrid.className='health-grid'"));
 assert.ok(html.includes("mean===null?'Not scored'"));
 assert.ok(html.includes("Math.round(reports.length/pages.length*100)"));
 assert.ok(html.includes('Search traffic and rankings are not measured.'));
 assert.ok(html.includes('Completion is the percentage of selected pages successfully inspected'));
});


test('SEO Studio V2.6 issue tracker presents counts from comparable pages only',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("tracker.id='site-history-tracker'"));
 assert.ok(html.includes("['Newly observed',newly],['Recurring',recurring],['No longer observed',cleared]"));
 assert.ok(html.includes("previousTracker.remove()"));
 assert.ok(html.includes("trackerGrid.className='tracker-grid'"));
 assert.ok(html.includes('Changes reflect issue/page occurrences only on pages audited in both runs.'));
});


test('SEO Studio V2.6 history entries navigate to current page evidence, not resolved items',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("jump.className='history-page-jump'"));
 assert.ok(html.includes("if(label==='No longer observed')"));
 assert.ok(html.includes("historic.textContent=affectedUrl+' (historical finding; no longer observed)'"));
 assert.ok(html.includes("search.value=affectedUrl;role.value='all'"));
 assert.ok(html.includes("pageDashboard.scrollIntoView({behavior:'smooth',block:'start'})"));
});


test('SEO Studio V2.6 fix tracking persists user statuses without claiming audit resolution',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const fixTrackerKey='micirql-seo-fix-tracker-v1:'+url.origin"));
 assert.ok(html.includes("['fixed','Marked fixed (awaiting audit)']"));
 assert.ok(html.includes("if(label!=='No longer observed')"));
 assert.ok(html.includes("note.maxLength=240"));
 assert.ok(html.includes("localStorage.setItem(fixTrackerKey,JSON.stringify(fixTracker))"));
 assert.ok(html.includes("feedback.textContent=saveFixTracker()?'Saved in this browser'"));
});


test('SEO fix verification requires later complete audit and distinguishes still detected findings',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("verification.id='site-fix-verification'"));
 assert.ok(html.includes("auditedAt>markedAt"));
 assert.ok(html.includes("completedUrls.has(page)"));
 assert.ok(html.includes("issueOccurrences.has(key)?'Still detected':'Verified absent'"));
 assert.ok(html.includes("state==='Awaiting verification'"));
 assert.ok(html.includes("markedAt:status==='fixed'"));
 assert.ok(html.includes("Verified absent means the finding was not detected"));
});


test('SEO progress summary reports audit evidence and browser-local fix verification without ranking claims',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("progressPanel.id='site-progress-report'"));
 assert.ok(html.includes("auditsAvailable:auditHistory.length+1"));
 assert.ok(html.includes("verifiedAbsent:verificationTotals.verified"));
 assert.ok(html.includes("stillDetected:verificationTotals.unresolved"));
 assert.ok(html.includes("awaitingVerification:verificationTotals.pending"));
 assert.ok(html.includes("reportType:'seo-progress-summary'"));
 assert.ok(html.includes("no search rankings or traffic data."));
});


test('SEO progress PDF report escapes content and includes verification caveats',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("printProgress.textContent='Print progress report / Save PDF'"));
 assert.ok(html.includes("issueRows=topIssues.map(issue=>"));
 assert.ok(html.includes("fixes=verificationRows.slice(0,30).map(item=>"));
 assert.ok(html.includes("const scoreChange=previous&&Number.isFinite(previous.averageScore)"));
 assert.ok(html.includes("const esc=value=>String(value??'').replace("));
 assert.ok(html.includes("win.document.write(html)"));
 assert.ok(html.includes("Different audited page sets can make average scores misleading."));
});


test('history comparisons only classify issues on fully inspected pages',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("completedUrls:reports.filter(page=>page.auditStatus==='complete'&&!page.partial).map(page=>page.url).sort()"));
 assert.ok(html.includes("const currentUrls=new Set(summarySnapshot.completedUrls)"));
 assert.ok(html.includes("const oldUrls=Array.isArray(previous.completedUrls)?new Set(previous.completedUrls):null"));
 assert.ok(html.includes('Older audit did not store complete-page evidence; page-level resolution cannot be confirmed.'));
});


test('V2.7 SEO opportunities prioritize observed severity without projecting search traffic',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("opportunitiesPanel.id='site-seo-opportunities'"));
 assert.ok(html.includes("issue.severity!=='info'"));
 assert.ok(html.includes("b.affectedPages-a.affectedPages"));
 assert.ok(html.includes("siteReport.opportunities=opportunities"));
 assert.ok(html.includes('not an estimate of traffic or ranking gains'));
 assert.ok(html.includes("selected.slice(0,25)"));
});


test('V2.7 opportunities include actionable text and bounded affected-page evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("recommendation:issue.action||issue.recommendation||issue.suggestedFix"));
 assert.ok(html.includes("toggle.textContent='How to fix and affected pages'"));
 assert.ok(html.includes("action.textContent=issue.recommendation"));
 assert.ok(html.includes("issue.affectedUrls.slice(0,10)"));
 assert.ok(html.includes("jump.textContent='Inspect '+address"));
});


test('V2.7 opportunity filtering and CSV action-plan export are bounded and spreadsheet safe',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("opportunitySeverityFilter.setAttribute('aria-label','Filter SEO opportunities by severity')"));
 assert.ok(html.includes("reachFilter.setAttribute('aria-label','Minimum affected pages')"));
 assert.ok(html.includes("const filteredOpportunities=()=>opportunities.filter("));
 assert.ok(html.includes("selected.slice(0,25)"));
 assert.ok(html.includes("exportOpportunities.addEventListener('click'"));
 assert.ok(html.includes("downloadReport('csv',rows.map(row=>row.map(csvCell).join(','))"));
 assert.ok(html.includes("replace(/^[\\s\\u0000-\\u001f]*[=+@-]/"));
});


test('V2.7 opportunity inspection links current evidence to audited page filtering',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("evidence.textContent='Evidence: '+issue.verificationStatus"));
 assert.ok(html.includes("jump.textContent='Inspect '+address"));
 assert.ok(html.includes("document.getElementById('site-page-dashboard')"));
 assert.ok(html.includes("search.value=address;role.value='all'"));
 assert.ok(html.includes("search.dispatchEvent(new Event('input',{bubbles:true}))"));
});


test('V2.7 developer remediation examples use safe text nodes and scoped checklists',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('const remediationExamples={'));
 assert.ok(html.includes('missing_canonical:{steps:'));
 assert.ok(html.includes('images_missing_alt:{steps:'));
 assert.ok(html.includes("guideTitle.textContent='Developer checklist'"));
 assert.ok(html.includes('code.textContent=guide.example'));
 assert.ok(html.includes("code.setAttribute('aria-label','Illustrative HTML example')"));
});


test('V2.7 remediation library covers duplicates, headings, schema and links without executing sample HTML',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 for(const code of ['duplicate_title','duplicate_description','duplicate_canonical','heading_hierarchy','no_structured_data','json_ld_missing_type','links_missing_name','links_http','links_javascript'])assert.ok(html.includes(code+':{steps:'),code);
 assert.ok(html.includes('code.textContent=guide.example'));
});

test('SEO remediation examples never terminate the inline script early',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.equal((html.match(/<\/script>/g)||[]).length,1,'Inline module must have a single real closing script tag');
 assert.ok(html.includes(String.raw`Example Business"}<\/script>`),'JSON-LD example closing tag must be escaped in source');
});

test('SEO Studio demo audit is local, visibly labeled, and excluded from saved history',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('id="site-demo"'));
 assert.ok(html.includes('const demoPages=['));
 assert.ok(html.includes('const isDemo=pendingDemo;pendingDemo=false'));
 assert.ok(html.includes('const response=isDemo?{ok:true,html:demoByUrl.get(pages[i])'));
 assert.ok(html.includes('if(!isDemo)saveCheckpoint(url.origin,pages,reports)'));
 assert.ok(html.includes('if(!isDemo){auditHistory.push(summarySnapshot)'));
 assert.ok(html.includes('DEMO ONLY'));
 assert.ok(html.includes('demo:isDemo'));
});

test('MiCirql Tools offers a first-party extension download with explicit Chrome installation steps',()=>{
 const seo=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const home=readFileSync(new URL('../public/tools/index.html',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 for(const page of [seo,home])assert.ok(page.includes('/extension/micirql-tools-extension.zip'));
 assert.ok(seo.includes('chrome://extensions'));
 assert.ok(seo.includes('Load unpacked'));
 assert.ok(seo.includes('Chrome extension connected'));
 assert.ok(workflow.includes('Package downloadable Chrome extension'));
 assert.ok(workflow.includes('unzip -t public/extension/micirql-tools-extension.zip'));
});

test('SEO discovery accepts the dedicated audit URL or Advanced Inspector URL without undefined demo state',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('id="site-url"'));
 assert.ok(html.includes("document.getElementById('site-url').value.trim()||document.getElementById('url').value.trim()"));
 const discover=html.slice(html.indexOf("discoverButton.addEventListener('click'"),html.indexOf("const demoButton="));
 assert.ok(!discover.includes('isDemo'),'Discovery cannot access demo-only scope');
 assert.ok(html.includes("new URL(isDemo?demoPages[0].url:document.getElementById('site-url').value.trim()"));
});

test('printable SEO client report includes all issue groups and verification guidance',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/const rows=issues\.map\(/);
 assert.match(html,/Fix and verification guide/);
 assert.match(html,/const guidance=issues\.map\(/);
 assert.doesNotMatch(html,/issues\.slice\(0,20\)/);
});

test('large-site checkpoint resumes only complete, nonpartial, scored pages',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/reusablePages\(\{pages,reports:reusable\},url\.origin,pages\)/);
 assert.match(html,/saved\.pages\.some\(p=>/);
 assert.match(html,/new URL\(p\)\.origin!==origin/);
});

test('partial audits retain recovery checkpoints and cached redirects stay same-origin',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/reports\.every\(r=>r\.auditStatus==='complete'&&!r\.partial&&Number\.isFinite\(r\.score\)\)/);
 assert.match(html,/reusablePages\(\{pages,reports:reusable\},url\.origin,pages\)/);
});


test('printable SEO report prioritizes failed and partial duplicate inspection records',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/const inspectedPages=new Map\(\)/);
 assert.match(html,/if\(!previous\|\|rank\(page\)>rank\(previous\)\)inspectedPages\.set\(page\.url,page\)/);
 assert.match(html,/item\.auditStatus==='failed'\?3:/);
 assert.match(html,/item\.partial\|\|item\.auditStatus==='partial'/);
 assert.match(html,/const inspectedUniqueCount=inspectedPages\.size/);
});

test('SEO page results expose incomplete HTML reasons and provisional scoring',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/page\.incompleteReasons\?\.length/);
 assert.match(html,/Incomplete HTML: /);
 assert.match(html,/page\.incompleteReasons\.join\('; '\)/);
 assert.match(html,/page\.partial\?' \(provisional\)'/);
});

test('live SEO audit loop retries incomplete HTML before persisting provisional results',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/for\(let attempt=1;attempt<=2;attempt\+\+\)/);
 assert.match(html,/if\(\(report\.partial\|\|report\.auditStatus==='partial'\)\&\&attempt<2\)/);
 assert.match(html,/Retrying incomplete HTML on page /);
 assert.match(html,/reports\.push\(report\);if\(!isDemo\)saveCheckpoint/);
});
