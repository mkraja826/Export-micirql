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
 assert.match(page,/selectionLimited:\(discovered\.originalCount\?\?discovered\.pages\.length\)>pages\.length/);
 assert.match(page,/Unvisited pages are not scored/);
 assert.match(page,/siteReport\.coverage\.successfulPercent/);
});

test('site audit retries failed page inspections at most twice and preserves failures',()=>{
 const page=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(page,/attempt<=2/);
 assert.match(page,/report\.attempts=attempt/);
 assert.match(page,/retryPolicy:\{maxAttemptsPerPage:2,sequential:true\}/);
 assert.match(page,/if\(lastError\)\{const message=/);
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
 assert.match(html,/micirql-seo-link-check-v3:/);
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
 assert.match(html,/renderPageRows\(\);\s*if\(failures\.length\)\{/);
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
 assert.ok(html.includes("summary.textContent=(issue.triageTier==='Investigate first'?'Fix first'"));
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
 assert.ok(html.includes("The average includes '+escapeHTML(valid.length)+' eligible page(s) out of '+escapeHTML(inspectedUniqueCount)+' unique inspection records"));
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
 assert.ok(html.includes("feedback.textContent=saved?'Saved in this browser'"));
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
 assert.match(html,/const inspectedUniqueCount=dedupedInspections\.size/);
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

test('SEO results describe recovered and persistently partial retry outcomes',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/if\(page\.attempts>1\)/);
 assert.match(html,/Still incomplete after /);
 assert.match(html,/Inspected after /);
 assert.match(html,/page\.attempts\+' attempts'/);
});

test('site coverage reports retry diagnostics and includes them in structured export',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/const retryDiagnostics=\{retried:reports\.filter/);
 assert.match(html,/recovered:reports\.filter/);
 assert.match(html,/stillPartial:reports\.filter/);
 assert.match(html,/retryPolicy:\{maxAttemptsPerPage:2,sequential:true\},scoreSummary,retryDiagnostics,failureDiagnostics,httpEvidenceCoverage:measuredHttp,coverage:/);
 assert.match(html,/Retry diagnostics: /);
 assert.match(html,/retryDiagnostics\.retried/);
 assert.match(html,/retryDiagnostics\.recovered/);
 assert.match(html,/retryDiagnostics\.stillPartial/);
});

test('capture failures have typed categories and a visible site-level breakdown',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/category,attempts:2/);
 assert.match(html,/const failureDiagnostics=\{timeout:failures\.filter/);
 assert.match(html,/extension:failures\.filter/);
 assert.match(html,/incompleteHtml:failures\.filter/);
 assert.match(html,/Capture failures: /);
 assert.match(html,/failureDiagnostics\.timeout/);
 assert.match(html,/failureDiagnostics\.extension/);
 assert.match(html,/failureDiagnostics\.incompleteHtml/);
});

test('live SEO audit retains partial evidence when second capture fails',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/let lastError=null;let partialReport=null/);
 assert.match(html,/partialReport=report;siteStatus/);
 assert.match(html,/if\(lastError&&partialReport\)/);
 assert.match(html,/partialReport\.recoveryError=lastError\.message/);
 assert.match(html,/reports\.push\(partialReport\)/);
});

test('SEO scores explicitly classify verified, provisional and unverified confidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/page\.scoreConfidence=page\.partial\|\|page\.auditStatus==='partial'\?'provisional'/);
 assert.match(html,/page\.auditStatus==='complete'&&Number\.isFinite\(page\.score\)\?'verified':'unverified'/);
 assert.match(html,/confidenceNote\.textContent='Confidence: '/);
 assert.match(html,/page\.scoreConfidence\|\|/);
});

test('printable and text SEO reports include per-page confidence and retry evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/<th>Score<\/th><th>Confidence<\/th><th>Findings<\/th>/);
 assert.match(html,/escapeHTML\(page\.scoreConfidence\|\|/);
 assert.match(html,/Page score confidence:/);
 assert.match(html,/page\.recoveryError\?' \| retry error: '/);
 assert.match(html,/page\.attempts\|\|1/);
});

test('selective reinspection is offered only for incomplete or failed live audits',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/id="site-retry-incomplete" disabled/);
 assert.match(html,/retryIncompleteButton\.addEventListener\('click'/);
 assert.match(html,/if\(!siteReport\|\|siteReport\.demo\|\|!extensionReady\)return/);
 assert.match(html,/page\.partial\|\|page\.auditStatus!=='complete'/);
 assert.match(html,/retryIncompleteButton\.disabled=isDemo\|\|!reports\.some/);
 assert.match(html,/retryIncompleteButton\.disabled=true;siteButton\.disabled=true/);
});
test('selective reinspection retains checkpoint recovery and existing retry policy',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/siteButton\.click\(\)/);
 assert.match(html,/const checkpoint=isDemo\?null:readCheckpoint\(url\.origin\)/);
 assert.match(html,/const cached=reusablePages\(\{pages,reports:reusable\},url\.origin,pages\)/);
 assert.match(html,/if\(cached\.has\(pages\[i\]\)\)/);
 assert.match(html,/for\(let attempt=1;attempt<=2;attempt\+\+\)/);
});

test('reinspection preserves prior provisional evidence when both new attempts fail',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/const previousRetryReport=retryIncompleteRequested\?siteReport:null/);
 assert.match(html,/if\(lastError&&previousRetryReport\?\.website===url\.origin\)/);
 assert.match(html,/page\.partial\|\|page\.auditStatus==='partial'/);
 assert.match(html,/reports\.push\(\{\.\.\.preserved,recoveryError:lastError\.message\|\|'Reinspection failed',reinspectionAttempts:2\}\)/);
 assert.match(html,/saveCheckpoint\(url\.origin,pages,reports\);lastError=null/);
});

test('site report recalculates score summary from eligible completed public pages',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/const eligiblePublicScores=reports\.filter\(page=>page\.pageRole==='public'&&page\.auditStatus==='complete'&&!page\.partial&&Number\.isFinite\(page\.score\)\)/);
 assert.match(html,/averagePublicHtmlScore:eligiblePublicScores\.length\?Math\.round\(eligiblePublicScores\.reduce\(\(sum,page\)=>sum\+page\.score,0\)\/eligiblePublicScores\.length\):null/);
 assert.match(html,/provisionalPages:reports\.filter\(page=>page\.partial\|\|page\.auditStatus==='partial'\)\.length/);
 assert.match(html,/const measuredCoverage=auditCoverage\(pages,reports,failures\)/);
 assert.match(html,/retryPolicy:\{maxAttemptsPerPage:2,sequential:true\},scoreSummary,retryDiagnostics,failureDiagnostics,httpEvidenceCoverage:measuredHttp,coverage:/);
});

test('reinspection pins original page selection and prioritizes previous completed evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/previousRetryReport\?\.website===url\.origin&&Array\.isArray\(previousRetryReport\.selectedPageUrls\)\?previousRetryReport\.selectedPageUrls\.slice\(\)/);
 assert.match(html,/previousRetryReport\?\.website===url\.origin&&JSON\.stringify\(previousRetryReport\.selectedPageUrls\)===JSON\.stringify\(pages\)\?previousRetryReport\.reports/);
 assert.match(html,/pagesSelected:pages\.length,selectedPageUrls:pages\.slice\(\),requestedLimit:maxPages/);
});

test('interrupted extension reinspection skips rediscovery and reuses prior scope',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/if\(!isDemo&&!previousRetryReport&&\(!selectedDiscovery\|\|selectedDiscovery\.startUrl!==url\.href\)\)await discoverForAudit\(url\)/);
 assert.match(html,/previousRetryReport\?\.website===url\.origin\?\{pages:previousRetryReport\.selectedPageUrls\|\|\[\],truncated:previousRetryReport\.coverage\?\.discoveryTruncated===true,originalCount:previousRetryReport\.pagesDiscovered\}/);
 assert.match(html,/const cached=reusablePages\(\{pages,reports:reusable\},url\.origin,pages\)/);
});

test('selective reinspection preserves original discovery totals and selection-limit evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/originalCount:previousRetryReport\.pagesDiscovered/);
 assert.match(html,/pagesDiscovered:discovered\.originalCount\?\?discovered\.pages\.length/);
 assert.match(html,/discovered:discovered\.originalCount\?\?discovered\.pages\.length/);
 assert.match(html,/selectionLimited:\(discovered\.originalCount\?\?discovered\.pages\.length\)>pages\.length/);
});

test('aborted reinspection restores previous report and export controls',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/if\(previousRetryReport\)\{siteReport=previousRetryReport;retryIncompleteButton\.disabled=!extensionReady/);
 assert.match(html,/siteExport\.disabled=false;siteExportText\.disabled=false;sitePrintButton\.disabled=false/);
 assert.match(html,/siteStatus\.textContent\+=' Previous audit evidence remains available for export and retry\.'/);
 assert.match(html,/finally\{siteButton\.disabled=false;demoButton\.disabled=false;discoverButton\.disabled=false\}/);
});

test('developer mode is opt-in, accessible, and switches issue explanations',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/id="developer-mode-toggle"[^>]*role="switch" aria-checked="false"/);
 assert.match(html,/let developerMode=false;/);
 assert.match(html,/developerModeToggle\.addEventListener\('click'/);
 assert.match(html,/document\.body\.classList\.toggle\('developer-mode',developerMode\)/);
 assert.match(html,/developerModeToggle\.setAttribute\('aria-checked',String\(developerMode\)\)/);
 assert.match(html,/el\.textContent=developerMode\?el\.dataset\.seoTechnical:el\.dataset\.seoSimple/);
 assert.match(html,/class="panel advanced-inspector developer-only"/);
 assert.ok(html.includes("if(!developerMode){document.getElementById('advanced-inspector').open=false;"));
 assert.match(html,/line\.dataset\.seoSimple=prefix\+explainSeoFinding\(item\)\+suffix/);
 assert.match(html,/line\.dataset\.seoTechnical=prefix\+'\['\+item\.code\+'\] '\+item\.message\+suffix/);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
});

test('scan progress and completion explain success, partial results, and recovery',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/id="site-progress-panel"/);
 assert.match(html,/id="site-progress-percent"/);
 assert.match(html,/const updateSiteProgress=\(\)=>/);
 assert.match(html,/siteProgress\.value=i\+1;updateSiteProgress\(\)/);
 assert.match(html,/Scan complete! /);
 assert.match(html,/pages needing another check/);
 assert.match(html,/Scan interrupted — you can try again/);
 assert.match(html,/site-scan-completion/);
 assert.match(html,/scanProgressPanel\.append\(completion\)/);
});

test('failed page recovery panel explains limitations and offers extension retry',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/failedPanel\.id='site-failed-pages'/);
 assert.match(html,/Pages that need another check/);
 assert.match(html,/They are not counted as verified SEO results/);
 assert.match(html,/retry\.addEventListener\('click',\(\)=>retryIncompleteButton\.click\(\)\)/);
 assert.match(html,/detail\.className='hint small developer-only'/);
 assert.match(html,/if\(!isDemo&&extensionReady\)/);
});

test('partial scan retry action is conditional and does not leave stale controls',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/if\(needsRetry&&!isDemo&&extensionReady\)/);
 assert.match(html,/retryNow\.className='seo-retry-now'/);
 assert.match(html,/retryNow\.addEventListener\('click',\(\)=>retryIncompleteButton\.click\(\)\)/);
 assert.match(html,/document\.querySelector\('#site-progress-panel \.seo-retry-now'\)\?\.remove\(\)/);
 assert.match(html,/document\.querySelector\('#site-progress-panel \.seo-results-jump'\)\?\.remove\(\)/);
 assert.match(html,/retryIncompleteRequested=true/);
 assert.match(html,/siteStatus\.textContent='Reinspecting '/);
 assert.match(html,/siteProgress\.value=0/);
});

test('retry progress distinguishes preserved pages from pages being rechecked',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/const retryRun=Boolean\(previousRetryReport\)/);
 assert.match(html,/const pagesToCheck=pages\.length-resumedCount/);
 assert.match(html,/let checkedThisRun=0/);
 assert.match(html,/Rechecking '\+pagesToCheck\+' pages/);
 assert.match(html,/Keeping '\+resumedCount\+' completed pages/);
 assert.match(html,/checkedThisRun\+\+/);
 assert.match(html,/Rechecking '\+checkedThisRun\+' of '\+pagesToCheck/);
 assert.match(html,/if\(cached\.has\(pages\[i\]\)\)/);
 assert.match(html,/siteProgress\.max=pages\.length/);
});

test('progress breakdown remains visible, accessible, and resets between scans',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/progressSummary\.id='site-progress-breakdown'/);
 assert.match(html,/progressSummary\.setAttribute\('role','status'\)/);
 assert.match(html,/retryProgressPanel\.append\(progressSummary\)/);
 assert.match(html,/const refreshProgressBreakdown=\(\)=>/);
 assert.match(html,/refreshProgressBreakdown\(\);siteStatus\.textContent=/);
 assert.match(html,/document\.getElementById\('site-progress-breakdown'\)\?\.remove\(\)/);
 assert.match(html,/@media\(max-width:600px\)/);
 assert.match(html,/\.seo-progress-breakdown\{/);
});

test('print report uses deduplicated inspection population for metrics and appendix',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('const uniqueReports=[...dedupedInspections.values()]'));
 assert.ok(html.includes('const valid=uniqueReports.filter('));
 assert.ok(html.includes('const appendix=uniqueReports.map('));
 assert.ok(html.includes('const inspectedUniqueCount=dedupedInspections.size'));
 assert.ok(html.includes('affectedUrls:[...new Set('));
});

test('Partha-style 60 inspections with four repeated URLs reconcile to 56 unique score records',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const start=html.indexOf('function printClientSeoReport(report){');
 const end=html.indexOf('sitePrintButton.addEventListener',start);
 assert.ok(start>=0&&end>start);
 const source=html.slice(start,end);
 const print=new Function('window','alert',source+'; return printClientSeoReport;');
 let rendered='';
 const fakeWindow={open:()=>({document:{open(){},write(value){rendered=value},close(){}}})};
 const printReport=print(fakeWindow,()=>{});
 const pages=Array.from({length:56},(_,i)=>({url:'https://parthadental.com/page-'+i+'/',requestedUrl:'https://parthadental.com/page-'+i+'/',score:i===0?33:80,auditStatus:'complete',partial:false,pageRole:'public',findings:[]}));
 const duplicates=[0,1,2,3].map(i=>({...pages[i],url:pages[i].url.slice(0,-1)}));
 const reports=[...pages,...duplicates];
 printReport({website:'https://parthadental.com',generatedAt:'2026-10-26T00:00:00Z',reports,pagesSelected:60,pagesAnalyzed:60,failures:[],issueCenter:[{code:'images_missing_alt',severity:'medium',recommendation:'Add descriptions',affectedUrls:[pages[0].url,duplicates[0].url]}],coverage:{discovered:60},reportNotes:[]});
 assert.match(rendered,/56 \/ 60<\/strong>Unique pages with inspection records/);
 assert.match(rendered,/55<\/td>/);
 assert.match(rendered,/1<\/td>/);
 assert.match(rendered,/Affected pages<\/th>/);
 const appendix=rendered.split('<h2>Audited page appendix</h2>')[1].split('<h2>Affected page appendix</h2>')[0];
 assert.equal((appendix.match(/<tr>/g)||[]).length,57);
 assert.match(rendered,/1 affected audited URL\(s\)/);
});


test('printable issue evidence uses inspected finding details and escapes HTML',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const start=html.indexOf('function printClientSeoReport(report){');
 const end=html.indexOf('sitePrintButton.addEventListener',start);
 assert.ok(start>=0&&end>start);
 const print=new Function('window','alert',html.slice(start,end)+'; return printClientSeoReport;')({open:()=>({document:{open(){},write(value){rendered=value},close(){}}})},()=>{});
 let rendered='';
 const url='https://example.com/about/';
 print({website:'https://example.com',generatedAt:'2026-10-26T00:00:00Z',pagesSelected:1,pagesAnalyzed:1,reports:[{url,requestedUrl:url,score:72,auditStatus:'complete',findings:[{code:'missing_alt',message:'Image <missing> alt',evidence:'<img src="x">'}]}],failures:[],issueCenter:[{code:'missing_alt',severity:'medium',recommendation:'Add alt text',affectedUrls:[url]}],coverage:{discovered:1},reportNotes:[]});
 assert.ok(rendered.includes('Issue evidence by page'));
 assert.ok(rendered.includes('Image &lt;missing&gt; alt'));
 assert.ok(rendered.includes('&lt;img src=&quot;x&quot;&gt;'));
 assert.ok(!rendered.includes('<img src="x">'));
 assert.ok(rendered.includes(url));
});


test('interactive SEO issue evidence remains accessible with technical elements behind developer mode',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/evidenceSummary\.textContent='Observed evidence: '/);
 assert.match(html,/evidencePanel\.className='issue-evidence'/);
 assert.match(html,/location\.textContent='Page: '\+page\.url/);
 assert.match(html,/observed\.textContent='Observed: '\+page\.observed/);
 assert.match(html,/technical\.className='developer-only'/);
 assert.ok(html.includes("snippets.className='developer-only'"));
 assert.ok(html.includes("group.className='panel developer-only'"));
 assert.match(html,/snippet\.textContent=\[entry\.element,entry\.attribute/);
 assert.match(html,/\.developer-only\{display:none\}/);
 assert.match(html,/body\.developer-mode \.developer-only\{display:block\}/);
 assert.ok(html.includes('technical.append(snippet)'));
});


test('issue evidence heading distinguishes displayed samples from recorded pages',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const allObservedPages=(issue.pageEvidence||[]).filter(page=>page.observed||(page.elements||[]).length)"));
 assert.ok(html.includes("const observedPages=allObservedPages.slice(0,8)"));
 assert.ok(html.includes("observedPages.length+' of '+allObservedPages.length"));
 assert.ok(html.includes("' shown (not a full-site count)'"));
});

test('turning off developer mode closes technical panels and advanced inspector',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("if(!developerMode){document.getElementById('advanced-inspector').open=false;"));
 assert.ok(html.includes("document.querySelectorAll('.developer-only details, details.developer-only, details.issue-technical')"));
 assert.ok(html.includes("forEach(panel=>{panel.open=false})"));
 assert.ok(html.includes("developerModeToggle.setAttribute('aria-checked',String(developerMode))"));
});

test('page-first SEO guidance does not falsely rule out shared templates',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("if(issue.sharedPatternPageCount<3&&issue.affectedUrls.length)"));
 assert.ok(html.includes("Start with the affected page"));
 assert.ok(html.includes("No repeated HTML element example was confirmed across three inspected pages for this finding; this does not rule out a shared template issue."));
 assert.ok(html.includes("if(issue.sharedPatternPageCount>=3)"));
});

test('shared SEO patterns are explained as possible template causes rather than proof',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("issue.sharedPatternPageCount=sameElement?Math.max(...(issue.sharedEvidence||[]).map(e=>e.affectedUrls.length)):0"));
 assert.ok(html.includes("if(issue.sharedPatternPageCount>=3)"));
 assert.ok(html.includes("the same recorded HTML example appears on "));
 assert.ok(html.includes("Check a shared header, footer, navigation, or page template before editing pages individually."));
 assert.ok(html.includes("This is a clue, not proof that the same code caused every issue."));
});

test('issue evidence explains missing plain-language observations without guessing',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("else if((page.elements||[]).length){const context=document.createElement('p')"));
 assert.ok(html.includes("context.textContent='Recorded HTML examples are available, but no plain-language observation was saved for this page. Inspect the examples before deciding what to change.'"));
 assert.ok(html.includes("context.className='hint small'"));
 assert.ok(html.includes("technical.className='developer-only'"));
});

test('beginner issue evidence identifies recorded HTML elements without exposing snippets',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("evidenceHint.textContent=(page.elements||[]).length+' recorded HTML element example(s) on this page. Turn on Developer Mode to inspect the element details.'"));
 assert.ok(html.includes("evidenceHint.className='hint small'"));
 assert.ok(html.includes("technical.className='developer-only'"));
 assert.ok(html.includes("snippets.className='developer-only'"));
});

test('printable SEO action plan labels affected audited URLs without a misleading selected-page denominator',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const pdfMarkup=html.slice(html.indexOf('function printClientSeoReport(report)'));
 assert.ok(pdfMarkup.includes("'+escapeHTML((issue.affectedUrls||[]).length)+' affected audited URL(s)"));
 assert.ok(!pdfMarkup.includes("'+escapeHTML(report.pagesSelected)+' selected</td>"));
});

test('audit history only compares average scores for identical completed URL coverage',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const sameCoverage=oldUrls!==null&&oldUrls.size===currentUrls.size&&[...currentUrls].every(page=>oldUrls.has(page))"));
 assert.ok(html.includes("const scoreDelta=!sameCoverage||summarySnapshot.averageScore===null||!Number.isFinite(previous.averageScore)?'Not comparable (different or unknown completed-page coverage)'"));
 assert.ok(html.includes("const comparableUrls=oldUrls?new Set([...currentUrls].filter(page=>oldUrls.has(page))):new Set()"));
 assert.ok(html.includes("const newly=[...now].filter(key=>comparableKey(key)&&!before.has(key)),cleared=[...before].filter(key=>comparableKey(key)&&!now.has(key)),recurring=[...now].filter(key=>comparableKey(key)&&before.has(key))"));
});

test('printable SEO report formats issue codes for nontechnical readers',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const pdfMarkup=html.slice(html.indexOf('function printClientSeoReport(report)'));
 assert.ok(pdfMarkup.includes("const readableIssueName=code=>String(code||'issue').replaceAll('_',' ').replace(/\\b\\w/g,letter=>letter.toUpperCase())"));
 assert.ok(pdfMarkup.includes("escapeHTML(readableIssueName(issue.code))"));
 assert.ok(!pdfMarkup.includes("escapeHTML(issue.code.replaceAll('_',' '))"));
});

test('printable SEO report discloses score-average eligibility and exclusions',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const pdfMarkup=html.slice(html.indexOf('function printClientSeoReport(report)'));
 assert.ok(pdfMarkup.includes("The average includes '+escapeHTML(valid.length)+' eligible page(s) out of '+escapeHTML(inspectedUniqueCount)+' unique inspection records"));
 assert.ok(pdfMarkup.includes("'+escapeHTML(inspectedUniqueCount-valid.length)+' record(s) were excluded because they were incomplete or unscored."));
 assert.ok(pdfMarkup.includes("const valid=uniqueReports.filter(page=>Number.isFinite(page.score)&&!page.partial&&page.auditStatus==='complete')"));
});

test('printable SEO report keeps A4 tables readable across page breaks',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const pdfStart=html.indexOf('function printClientSeoReport(report)');
 assert.ok(pdfStart>=0);
 const pdfMarkup=html.slice(pdfStart);
 assert.ok(pdfMarkup.includes('body{margin:0;max-width:none;font-size:11pt;line-height:1.45}'));
 assert.ok(pdfMarkup.includes('h1,h2,h3{break-after:avoid}'));
 assert.ok(pdfMarkup.includes('table{display:table;overflow:visible;font-size:9pt;table-layout:fixed}'));
 assert.ok(pdfMarkup.includes('thead{display:table-header-group}'));
 assert.ok(pdfMarkup.includes('tr,.guide{break-inside:avoid}'));
 assert.ok(pdfMarkup.includes('td,th{overflow-wrap:anywhere;word-break:break-word}'));
 assert.ok(pdfMarkup.includes('@page{size:A4;margin:14mm}'));
});

test('printable SEO action plan labels suggested priority without hiding severity',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("issue.severity==='high'?'Fix first':issue.severity==='medium'?'Fix next':'Optional review'"));
 assert.ok(html.includes('<th>Suggested priority</th><th>Severity</th><th>Issue</th>'));
 assert.ok(html.includes('colspan="6">No grouped findings in inspected pages.'));
});

test('printable SEO report highlights failed and partial inspections in its executive summary',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const coverageWarning=failedCount||partialCount?"));
 assert.ok(html.includes("Audit completeness warning:"));
 assert.ok(html.includes("These pages may have unreported SEO issues and are excluded from the eligible HTML score average."));
 assert.ok(html.includes("'+coverageWarning+'<h2>Executive priorities</h2>"));
});

test('printable SEO report avoids claiming zero findings means no fixes are needed',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('No grouped findings were recorded in the inspected pages. This does not establish that the website is free of SEO issues; review audit coverage and incomplete inspections below.'));
 assert.ok(!html.includes('<p>No fixes required by current checks.</p>'));
});

test('SEO show-all-findings control resets search and both filters',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("clearIssueFilters.textContent='Show all findings'"));
 assert.ok(html.includes("clearIssueFilters.setAttribute('aria-label','Clear SEO issue search and filters')"));
 assert.ok(html.includes("severityFilter.value='all';categoryFilter.value='all';issueSearch.value='';renderIssues()"));
 assert.ok(html.includes("siteResults.append(clearIssueFilters)"));
});

test('filtered action plans warn that hidden findings may have different priorities',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("if(visible.length&&visible.length<issues.length){const filterHint=document.createElement('p')"));
 assert.ok(html.includes("You are viewing '+visible.length+' of '+issues.length+' issue groups."));
 assert.ok(html.includes("Clear the filters to see the complete action plan; hidden findings may have a different priority."));
 assert.ok(html.includes("issueContainer.append(filterHint)"));
});

test('SEO issue counter exposes filtered scope to assistive technology',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const filtersActive=selected!=='all'||categoryFilter.value!=='all'||Boolean(query)"));
 assert.ok(html.includes("issueCount.setAttribute('aria-label',(filtersActive?'Filtered audit findings: ':'All audit findings: ')"));
 assert.ok(html.includes("visible.length+' of '+issues.length+' issue groups shown'"));
});

test('empty SEO issue results distinguish filters from a clean-looking audit',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("if(!visible.length){const empty=document.createElement('p')"));
 assert.ok(html.includes("issues.length?'No findings match these filters."));
 assert.ok(html.includes("Clear the search or select all severities and categories to review the full audit."));
 assert.ok(html.includes("No issue groups were recorded in this audit. This does not prove the website has no SEO problems."));
});

test('beginner action plan counts filtered issue groups without implying site-wide scope',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const priorityCounts={'Investigate first':0,'Review next':0,'Lower priority':0}"));
 assert.ok(html.includes("for(const issue of visible){if(Object.hasOwn(priorityCounts,issue.triageTier))priorityCounts[issue.triageTier]++}"));
 assert.ok(html.includes("prioritySummary.textContent='Your action plan: '"));
 assert.ok(html.includes("These are issue groups in the current filtered results, not counts of affected pages."));
 assert.ok(html.includes("issueContainer.append(prioritySummary)"));
});

test('beginner SEO priorities retain cautious triage rationale',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("issue.triageTier==='Investigate first'?'Fix first'"));
 assert.ok(html.includes("issue.triageTier==='Review next'?'Fix next':'Optional review'"));
 assert.ok(html.includes("priorityHelp.textContent='Suggested priority: '"));
 assert.ok(html.includes("issue.triageReason+' This is guidance based on audit signals, not a guarantee of search impact.'"));
});

test('beginner SEO issue cards clarify inspected-page scope',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("scopeSummary.textContent='Affected in this audit: '+issue.affectedUrls.length"));
 assert.ok(html.includes("This count describes the pages checked, not every page on the website."));
});

test('SEO issues without custom verification get cautious beginner fallback',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("if(fixGuide.verification||fixGuide.verify)"));
 assert.ok(html.includes("else{const verifyFallback=document.createElement('p')"));
 assert.ok(html.includes("After making changes, run a new audit and compare this finding on the affected pages."));
 assert.ok(html.includes("it does not guarantee search-engine indexing or rankings."));
});

test('interactive SEO issue guidance presents beginner fix steps and verification safely',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const fixGuide=issue.fixGuide||{}"));
 assert.ok(html.includes("why.textContent='Why it matters: '+fixGuide.why"));
 assert.ok(html.includes("heading.textContent='How to fix it'"));
 assert.ok(html.includes("steps=document.createElement('ol')"));
 assert.ok(html.includes("item.textContent=step"));
 assert.ok(html.includes("verify.textContent='How to check the fix: '"));
 assert.ok(html.includes('fixGuide.verification||fixGuide.verify'));
});

test('SEO Studio warns when installed extension lacks HTTP response capability',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/event\.data\.protocol>=3/);
 assert.match(html,/capabilities\.includes\('seo-http-evidence'\)/);
 assert.match(html,/Update extension for HTTP status\/header verification/);
 assert.match(html,/extensionStatus\.dataset\.httpEvidence/);
});

test('extension update instructions explain replacing existing unpacked files and reloading Chrome',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/same permanent extension folder/);
 assert.match(html,/chrome:\/\/extensions/);
 assert.match(html,/0\.3\.13 or newer/);
 assert.match(html,/HTTP evidence is supported/);
});

test('HTTP findings propagate from extension response into exported site audit reports',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/httpEvidence:response\.httpEvidence\|\|\{observed:false,status:null,headers:\{\}\}/);
 assert.match(html,/const httpCheck=interpretHttpEvidence\(response\.httpEvidence,report\.canonical,report\.url\)/);
 assert.match(html,/report\.httpVerification=\{verified:httpCheck\.verified,status:httpCheck\.status\?\?null\}/);
 assert.match(html,/if\(httpCheck\.findings\.length\)report\.findings\.push\(\.\.\.httpCheck\.findings\)/);
 assert.match(html,/httpEvidenceCoverage:measuredHttp/);
 assert.match(html,/JSON\.stringify\(siteReport,null,2\)/);
});

test('unverified link panel explains manual verification and conservative broken-link classification',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/This HTML audit has not checked every link destination/);
 assert.match(html,/Only HTTP 404\/410 is marked broken/);
 assert.match(html,/Verify uninspected internal link destinations with Chrome/);
 assert.match(html,/MICIRQL_SEO_LINK_CHECK/);
});

test('link checker offers a dedicated dashboard launch control and live progress',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/quickVerify\.id='seo-link-verification-dashboard'/);
 assert.match(html,/siteResults\.prepend\(quickVerify\)/);
 assert.match(html,/quickStart\.addEventListener\('click',\(\)=>startButton\.click\(\)\)/);
 assert.match(html,/quickSummary\.textContent='Checked '/);
 assert.match(html,/quickStart\.disabled=running/);
});

test('link dashboard separates verified broken, server errors and uncertain destinations',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/counts=\{reachable:0,broken:0,server_error:0,unverified:0\}/);
 assert.match(html,/Fix broken destinations or update their referring links/);
 assert.match(html,/Investigate server failures and retry after recovery/);
 assert.match(html,/Retry timeouts or blocked requests/);
});

test('verified 404 and 410 links appear in structured export and text report with referring pages',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/siteReport\.verifiedBrokenLinks=siteReport\.linkVerification\.filter/);
 assert.match(html,/item\.classification==='broken'&&\(item\.status===404\|\|item\.status===410\)/);
 assert.match(html,/CONFIRMED BROKEN INTERNAL LINKS \(HTTP 404\/410\)/);
 assert.match(html,/Linked from: /);
});

test('printable audit prioritizes confirmed 404/410 links and includes referring page evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/issues\.unshift\(\{code:'verified_broken_internal_links'/);
 assert.match(html,/const brokenLinkEvidence=brokenLinks\.length/);
 assert.match(html,/\+brokenLinkEvidence\+diagnosticSummary\+linkDiagnosticEvidence\+'<h2>Score breakdown/);
 assert.match(html,/row\.referringPages\|\|\[\]/);
});

test('confirmed broken links sync into interactive priority findings, but uncertain results do not',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/const confirmed=\[\.\.\.completed\.values\(\)\]\.filter\(row=>row\.classification==='broken'&&\(row\.status===404\|\|row\.status===410\)\)/);
 assert.match(html,/issues\.findIndex\(issue=>issue\.code==='verified_broken_internal_links'\)/);
 assert.match(html,/if\(confirmed\.length\)\{/);
 assert.match(html,/siteReport\.verifiedBrokenLinks=confirmed\.map/);
 assert.match(html,/renderIssues\(\);/);
 assert.match(html,/quickStart\.disabled=running/);
});

test('verified link findings remain synchronized for JSON and printable reports',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/siteReport\.issueCenter=issues\.map\(issue=>\(\{\.\.\.issue\}\)\)/);
 assert.match(html,/siteReport\.linkVerification=\[\.\.\.completed\.values\(\)\]/);
 assert.match(html,/brokenLinks\.length&&!issues\.some\(issue=>issue\.code==='verified_broken_internal_links'\)/);
});

test('link verification dashboard exposes accessible progress and incomplete state',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/quickProgress=document\.createElement\('progress'\)/);
 assert.match(html,/quickProgress\.max=queue\.length/);
 assert.match(html,/quickProgress\.value=completed\.size/);
 assert.match(html,/Verification paused or incomplete/);
 assert.match(html,/Not started: link destination responses have not been checked/);
});

test('link checker resumes outstanding destinations and requires an explicit full recheck',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/if\(completed\.size===queue\.length\)return/);
 assert.match(html,/recheckButton\.textContent='Recheck all destinations'/);
 assert.match(html,/recheckButton\.addEventListener\('click'/);
 assert.match(html,/startButton\.disabled=running\|\|checked===queue\.length/);
});

test('dashboard start button disables at completion and displays explicit recheck',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/quickStart\.disabled=running\|\|completed\.size===queue\.length/);
 assert.match(html,/quickVerify\.append\(recheckButton\)/);
});

test('link verification refresh cannot recursively rebuild issues or stack dashboard panels',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/pending\.size&&!siteResults\.querySelector\('#seo-link-verification-dashboard'\)/);
 assert.doesNotMatch(html,/siteResults\.querySelectorAll\('#seo-link-verification-dashboard'\)\.forEach\(panel=>panel\.remove\(\)\)/);
 assert.match(html,/siteReport\.linkVerification=\[\.\.\.completed\.values\(\)\];\s*\/\/ Do not call renderIssues\(\) here:[^\n]*\n\s*quickProgress\.value=completed\.size/);
 assert.doesNotMatch(html,/siteReport\.linkVerification=\[\.\.\.completed\.values\(\)\];\s*renderIssues\(\);/);
});

test('link verification summary distinguishes unchecked URLs from inconclusive checks',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.match(html,/queue\.length-completed\.size/);
 assert.match(html,/not yet checked/);
 assert.match(html,/inconclusive checks/);
});

test('high severity findings receive first priority and printed page table fits paper',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("issue.triageTier=issue.severity==='high'?'Investigate first'"));
 assert.ok(html.includes('width:43%!important'));
 assert.ok(html.includes('min-width:0!important'));
});

test('link verification provides bounded browser-confirmed destination evidence with referring pages',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("quickEvidenceTitle.textContent='View '+confirmed.length"));
 assert.ok(html.includes('confirmed.slice(0,60)'));
 assert.ok(html.includes("url.textContent='HTTP '+row.status+' '+row.destination"));
 assert.ok(html.includes("sources.textContent='Linked from: '"));
});

test('template-like broken URLs retain HTTP evidence and explain malformed href',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('Possible malformed template URL: check the original href'));
 assert.ok(html.includes("' is observed, but the link may have been generated incorrectly.'"));
});

test('link diagnostics distinguish observed HTTP results from malformed URL heuristics',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('siteReport.linkDiagnostics=[...completed.values()].map'));
 for(const label of ['possible_malformed_source_link','broken_after_redirect','confirmed_http_404_410','inconclusive_request'])assert.ok(html.includes(label));
 assert.ok(html.includes('malformed-source classification is a heuristic'));
});

test('TXT and printable reports retain browser link diagnostic labels',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("'LINK DIAGNOSTICS: '"));
 assert.ok(html.includes('const linkDiagnosticEvidence=diagnosticRows.length'));
 assert.ok(html.includes('brokenLinkEvidence+diagnosticSummary+linkDiagnosticEvidence'));
});

test('client PDF summarizes verified link classifications without treating unchecked as broken',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('const diagnosticCounts={reachable:0,broken:0,server_error:0,unverified:0}'));
 assert.ok(html.includes('No unchecked destination is counted as broken.'));
 assert.ok(html.includes('brokenLinkEvidence+diagnosticSummary+linkDiagnosticEvidence'));
});

test('verified broken link guidance differentiates redirects and intentional test endpoints',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('this link redirects to a missing destination'));
 assert.ok(html.includes('correct its link address or restore the missing destination'));
 assert.ok(html.includes('intentional test endpoint'));
});

test('restoring link verification does not append duplicate cached results',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('siteReport.linkVerification=[...completed.values()];'));
 assert.ok(!html.includes('for(const x of completed.values())siteReport.linkVerification.push(x)'));
});

test('restored link evidence requires consistent HTTP classifications',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('const validCachedRow=row=>'));
 assert.ok(html.includes("row.classification==='broken'&&[404,410].includes(row.status)"));
 assert.ok(html.includes("row.classification==='reachable'&&Number.isInteger(row.status)"));
 assert.ok(html.includes('saved.filter(validCachedRow)'));
});

test('restored link evidence refreshes referring pages from the current audit',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('saved.filter(validCachedRow).map(x=>[x.destination,{...x,referringPages:[...new Set(pending.get(x.destination)||[])]}]')); 
});

test('finding filters keep active link verification mounted without duplicate panels',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("pending.size&&!siteResults.querySelector('#seo-link-verification-dashboard')"));
 assert.ok(!html.includes("siteResults.querySelectorAll('#seo-link-verification-dashboard').forEach(panel=>panel.remove())"));
});

test('live link checker reconciles classification against observed HTTP status',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('// HTTP status is authoritative; do not persist contradictory extension labels.'));
 assert.ok(html.includes("row.classification=row.status===404||row.status===410?'broken'"));
 assert.ok(html.indexOf('row.classification=row.status===404||row.status===410')<html.indexOf('completed.set(destination,row)'));
});

test('pausing link verification is visible while active requests finish',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("running?(stop?'Pausing after active checks finish…':'Checking link destinations in Chrome…')"));
 assert.ok(html.includes("running?(stop?'Pausing checks…':'Checking links…')"));
});

test('link-check state messages behave across running, pausing and resumed states',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const stateExpression=html.match(/quickState\.textContent=(.*?);\s*quickStart\.disabled=/s)?.[1];
 const buttonExpression=html.match(/startButton\.textContent=(running\?.*?);\s*startButton\.disabled=/s)?.[1];
 assert.ok(stateExpression,'Find live status expression');
 assert.ok(buttonExpression,'Find live button expression');
 const status=Function('running','stop','completed','queue','return '+stateExpression);
 const button=Function('running','stop','checked','queue','return '+buttonExpression);
 const queue={length:90};
 const completed={size:23};
 assert.match(status(false,false,completed,queue),/paused or incomplete/i);
 assert.match(status(true,false,completed,queue),/Checking link destinations/);
 assert.match(status(true,true,completed,queue),/Pausing after active checks finish/);
 assert.equal(button(true,true,23,queue),'Pausing checks…');
 assert.equal(button(true,false,23,queue),'Checking links…');
 assert.equal(button(false,false,23,queue),'Start / resume verification');
 assert.match(status(false,false,{size:90},queue),/All selected destinations checked/);
 assert.equal(button(false,false,90,queue),'All destinations checked');
});

test('resuming link checks skips already completed destinations, including saved 404 and inconclusive results',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const expression=html.match(/const remaining=(queue\.filter\(destination=>!completed\.has\(destination\)\));/)?.[1];
 assert.ok(expression,'Find the live destination-resume expression');
 const remaining=Function('queue','completed','return '+expression);
 const queue=['https://example.org/a','https://example.org/b','https://example.org/c','https://example.org/d'];
 const completed=new Map([[queue[0],{classification:'reachable'}],[queue[1],{classification:'broken',status:404}],[queue[2],{classification:'unverified'}]]);
 assert.deepEqual(remaining(queue,completed),[queue[3]]);
 completed.delete(queue[2]);
 assert.deepEqual(remaining(queue,completed),[queue[2],queue[3]],'Retrying inconclusive results should include them once');
});

test('saved link progress restores only current, status-consistent destinations',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const expression=html.match(/const validCachedRow=row=>(.*?);const completed=new Map/s)?.[1];
 assert.ok(expression,'Find production cached-row validator');
 const queue=['https://example.org/a','https://example.org/b','https://example.org/c'];
 const validCachedRow=Function('queue','return row=>'+expression)(queue);
 const stored=[
  {destination:queue[0],classification:'broken',status:404,referringPages:['https://example.org/old']},
  {destination:queue[1],classification:'reachable',status:200},
  {destination:queue[2],classification:'unverified',status:null},
  {destination:'https://example.org/removed',classification:'broken',status:410},
  {destination:queue[1],classification:'broken',status:200},
  {destination:queue[0],classification:'server_error',status:404},
  null
 ];
 const pending=new Map([[queue[0],['https://example.org/new','https://example.org/new']],[queue[1],['https://example.org/home']],[queue[2],[]]]);
 const restored=new Map(stored.filter(validCachedRow).map(x=>[x.destination,{...x,referringPages:[...new Set(pending.get(x.destination)||[])]}]));
 assert.equal(restored.size,3);
 assert.deepEqual(restored.get(queue[0]).referringPages,['https://example.org/new']);
 assert.equal(restored.get(queue[0]).status,404);
 assert.equal(restored.get(queue[1]).classification,'reachable');
 assert.equal(restored.get(queue[2]).classification,'unverified');
 assert.deepEqual(queue.filter(destination=>!restored.has(destination)),[]);
 restored.delete(queue[2]);
 assert.deepEqual(queue.filter(destination=>!restored.has(destination)),[queue[2]]);
});

test('saved link checks are isolated by the current inspected audit fingerprint',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const expression=html.match(/const auditSignature=(JSON\.stringify\(reports\.map\(.*?\)\));/)?.[1];
 assert.ok(expression,'audit fingerprint expression exists');
 const signature=Function('reports','return '+expression);
 const first=[{url:'https://example.com/',title:'Home',score:92,internalLinkTargets:['https://example.com/a']}];
 assert.equal(signature(first),signature([{...first[0]}]));
 assert.notEqual(signature(first),signature([{...first[0],internalLinkTargets:['https://example.com/b']}]));
 assert.notEqual(signature(first),signature([{...first[0],score:88}]));
 assert.ok(html.includes('data.auditSignature===auditSignature'));
 assert.ok(html.includes('JSON.stringify({auditSignature,savedAt:Date.now(),rows:[...completed.values()]})'));
});

test('saved link cache accepts only the matching audit within 24 hours',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const match=html.match(/return (data&&data\.auditSignature===auditSignature&&Date\.now\(\)-data\.savedAt<86400000&&Array\.isArray\(data\.rows\)\?data\.rows:\[\])/);
 assert.ok(match,'Find production audit cache acceptance expression');
 const restore=Function('data','auditSignature','now','Date','return '+match[1]);
 const now=1750000000000;
 const clock={now:()=>now};
 const rows=[{destination:'https://example.org/missing',classification:'broken',status:404}];
 const data={auditSignature:'audit-A',savedAt:now-120000,rows};
 assert.deepEqual(restore(data,'audit-A',now,clock),rows);
 assert.deepEqual(restore(data,'audit-B',now,clock),[]);
 assert.deepEqual(restore({...data,savedAt:now-86400001},'audit-A',now,clock),[]);
 assert.deepEqual(restore({...data,rows:{}},'audit-A',now,clock),[]);
 assert.deepEqual(restore(null,'audit-A',now,clock),[]);
});

test('different audits on one domain persist to separate browser cache keys',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("const scopeKey='micirql-seo-link-check-v3:'+siteReport.website+':'+auditHash.toString(16)"));
 assert.ok(html.includes('data.auditSignature===auditSignature'));
 const hash=value=>{let n=2166136261;for(let i=0;i<value.length;i++)n=Math.imul(n^value.charCodeAt(i),16777619)>>>0;return n.toString(16)};
 const key=signature=>'micirql-seo-link-check-v3:https://example.org/:'+hash(signature);
 const a=key('audit pages A');const b=key('audit pages B');
 assert.notEqual(a,b);
 const storage=new Map([[a,{auditSignature:'audit pages A',rows:[{status:404}]}],[b,{auditSignature:'audit pages B',rows:[{status:200}]}]]);
 assert.equal(storage.get(a).rows[0].status,404);
 assert.equal(storage.get(b).rows[0].status,200);
});

test('per-audit cache cleanup retains current and non-expired snapshots',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("key===scopeKey)continue"));
 assert.ok(html.includes('Date.now()-entry.savedAt>=86400000'));
 assert.ok(html.includes("key.startsWith(prefix)"));
});

test('link checker warns when browser cannot checkpoint progress',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("checkpointWarning=' Browser storage could not save this progress."));
 assert.ok(html.includes("Network failures can be retried.'+checkpointWarning"));
 assert.ok(html.includes("checkpointWarning=''"));
});

test('checkpoint warning appears on storage failure and clears after recovery',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const match=html.match(/let checkpointWarning='';const save=\(\)=>\{(.*?)\};\s*const refresh=/s);
 assert.ok(match,'Find production save implementation');
 let fail=true;
 const storage={setItem(){if(fail)throw Error('Storage quota exceeded')}};
 const setup=Function('localStorage','scopeKey','auditSignature','completed',"let checkpointWarning='';const save=()=>{"+match[1]+"};return {save,warning:()=>checkpointWarning}");
 const state=setup(storage,'test-cache','test-audit',new Map([['a',{status:200}]]));
 state.save();
 assert.match(state.warning(),/could not save this progress/);
 fail=false;
 state.save();
 assert.equal(state.warning(),'');
});

test('beginner link dashboard gives status-specific next actions',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("quickAction.setAttribute('aria-label','Recommended next step')"));
 assert.ok(html.includes('Next: retry '));
 assert.ok(html.includes("'Fix first: review '+counts.broken+' confirmed broken destination(s)."));
 assert.ok(html.includes('Verification complete: no confirmed broken links'));
 assert.ok(html.includes('quickSummary,quickAction,quickProgress'));
});

test('link verification guidance prioritizes confirmed HTTP failures before unchecked work',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const guidance=html.match(/quickAction\.textContent=(.*?);\s*const confirmed=/s)?.[1];
 assert.ok(guidance,'Find current recommended next step');
 assert.ok(guidance.indexOf('counts.broken?')<guidance.indexOf('completed.size<queue.length?'));
 assert.ok(guidance.includes('do not count them as broken'));
 assert.ok(guidance.includes('remaining destination(s)'));
});

test('common SEO findings have beginner explanations without removing technical evidence',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 for(const code of ['missing_meta_description','missing_h1','multiple_h1','missing_alt','noindex','thin_content','broken_internal_links','internal_links_unverified']){
  assert.ok(html.includes(code+':['),'Expected beginner guidance for '+code);
 }
 assert.ok(html.includes("plain.textContent='In simple terms: '+beginnerDetail[0]"));
 assert.ok(html.includes("technicalSummary.textContent='Technical details'"));
 assert.ok(html.includes("How to check the fix: "));
});

test('guided SEO repair links to audited pages and requires fresh verification',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("guidedSummary.textContent='Fix this issue — guided steps'"));
 assert.ok(html.includes("guidePagesSummary.textContent='Open affected pages ('+issue.affectedUrls.length+')'"));
 assert.ok(html.includes("a.rel='noopener noreferrer'"));
 assert.ok(html.includes("compare a fresh, complete audit of the same pages"));
 assert.ok(html.includes("MiCirql cannot edit your website automatically"));
});

test('guided repair cards save page-level fix status without claiming verification',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("controls.setAttribute('aria-label','Fix status for '+pageUrl)"));
 assert.ok(html.includes("'I published a fix'"));
 assert.ok(html.includes("const currentStatus=()=>fixTracker[key]?.status||'untracked'"));
 assert.ok(html.includes("markedAt:nextStatus==='fixed'"));
 assert.ok(html.includes("result.textContent=saved?"));
 assert.ok(html.includes("run a new complete audit to verify"));
});

test('SEO fix dashboard uses browser tracker and refreshes after changes',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("fixDashboard.id='site-fix-dashboard'"));
 for(const label of ['Planned','Addressed','Still detected','Verified absent','Awaiting verification'])assert.ok(html.includes("'"+label+"'"));
 assert.ok(html.includes("document.addEventListener('seo-fix-tracker-updated',refreshFixDashboard)"));
 assert.ok(html.includes("document.dispatchEvent(new Event('seo-fix-tracker-updated'))"));
 assert.ok(html.includes("auditedAt<=markedAt||!completedUrls.has(page)"));
 assert.ok(html.includes("not improved rankings"));
});

test('mobile SEO dashboard metrics navigate to repair details',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("metric.className='tracker-metric fix-metric-button'"));
 assert.ok(html.includes("metric.addEventListener('click'"));
 assert.ok(html.includes("repairTasks.scrollIntoView({behavior:'smooth',block:'start'})"));
 assert.ok(html.includes("grid-template-columns:repeat(2,minmax(0,1fr))"));
});

test('SEO fix metric selection filters the matching browser-local repair tasks',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("repairTasks.id='seo-filtered-repairs'"));
 assert.ok(html.includes("activeRepairFilter=label;renderRepairTasks()"));
 assert.ok(html.includes("repairState(key,item)===activeRepairFilter"));
 assert.ok(html.includes("repairList.replaceChildren()"));
 assert.ok(html.includes("li.append(label,stateBadge,explanation,progress,link,instruction,guide)"));
});

test('filtered repair tasks open the relevant guided issue and support mobile controls',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("guide.textContent='Open issue guide'"));
 assert.ok(html.includes("issueSearch.value=key.slice(0,split);renderIssues()"));
 assert.ok(html.includes("if(guided)guided.open=true"));
 assert.ok(html.includes("#seo-filtered-repairs .repair-guide-link{width:100%;justify-content:center}"));
 assert.ok(html.includes("guide.setAttribute('aria-label','Open repair guide for '"));
});

test('repair workflow stages distinguish published changes from verified absent findings',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("stateBadge.textContent=repairState(key,item)"));
 assert.ok(html.includes("progress.max=3"));
 assert.ok(html.includes("stateBadge.textContent==='Verified absent'?3"));
 assert.ok(html.includes("stateBadge.textContent==='Awaiting verification'?2:1"));
 assert.ok(html.includes("progress.setAttribute('aria-label','Repair workflow stage '"));
});

test('addressed repair dashboard filter includes all published fixes regardless of audit outcome',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("activeRepairFilter==='Addressed'?item.status==='fixed':repairState(key,item)===activeRepairFilter"));
 assert.ok(html.includes("states.filter(value=>value==='Still detected')"));
 assert.ok(html.includes("states.filter(value=>value==='Verified absent')"));
 assert.ok(html.includes("states.filter(value=>value==='Awaiting verification')"));
});

test('fix status persistence and immediate refresh contract supports the demo audit',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const saveMatch=html.match(/const saveFixTracker=\(\)=>\{(.*?)\};/s);
 assert.ok(saveMatch,'Find the production browser-storage writer');
 const storage=new Map();
 const localStorage={setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)||null};
 const fixTrackerKey='micirql-seo-fix-tracker-v1:https://demo.micirql.invalid';
 const fixTracker={};
 const saveFixTracker=Function('localStorage','fixTrackerKey','fixTracker', 'return ()=>{'+saveMatch[1]+'};')(localStorage,fixTrackerKey,fixTracker);
 const key='missing_canonical|https://demo.micirql.invalid/';
 fixTracker[key]={status:'planned',note:'',markedAt:null};
 assert.equal(saveFixTracker(),true,'The planned repair should save');
 let planned=Object.values(fixTracker).filter(item=>item.status==='planned').length;
 assert.equal(planned,1,'Dashboard planned metric should reflect saved repair');
 const reloaded=JSON.parse(localStorage.getItem(fixTrackerKey));
 assert.equal(reloaded[key].status,'planned','Browser reload can recover the stored selection');
 const now=new Date().toISOString();
 reloaded[key]={status:'fixed',note:'',markedAt:now};
 assert.equal(reloaded[key].status,'fixed');
 assert.ok(html.includes("document.dispatchEvent(new Event('seo-fix-tracker-updated'))"),'Status updates dispatch an immediate refresh');
 assert.ok(html.includes("document.addEventListener('seo-fix-tracker-updated',refreshFixDashboard)"),'Dashboard subscribes to refresh events');
 const markedAt=Date.parse(now),auditedAt=Date.parse('2026-01-01T00:00:00Z');
 const completedUrls=new Set(['https://demo.micirql.invalid/']);
 assert.equal(auditedAt>markedAt&&completedUrls.has('https://demo.micirql.invalid/'),false,'A fix marked after an audit remains awaiting verification');
});

test('repair status controls update immediately and report storage failures clearly',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("button.addEventListener('click',()=>setGuidedStatus(value))"));
 assert.ok(html.includes("button.dataset.status=value"));
 assert.ok(html.includes("state.addEventListener('input',persist)"));
 assert.ok(html.includes("document.dispatchEvent(new Event('seo-fix-tracker-updated'));result.textContent=saved?"));
 assert.ok(html.includes("it may not persist after reload"));
});

test('guided repairs offer an explicit save action in addition to automatic status updates',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("controls.className='repair-status-actions'"));
 assert.ok(html.includes("button.addEventListener('click',()=>setGuidedStatus(value))"));
 assert.ok(html.includes("button.addEventListener('click',()=>setGuidedStatus(value))"));
 assert.ok(html.includes("li.append(controls,result)"));
 assert.ok(html.includes("result.textContent=saved?"));
});

test('repair verification requires newer complete page evidence and distinguishes still detected from absent',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 const match=html.match(/const repairState=\(key,item\)=>\{(.*?)\};/s);
 assert.ok(match,'Production repair verification function exists');
 const key='missing_canonical|https://demo.micirql.invalid/';
 const page='https://demo.micirql.invalid/';
 const markedAt='2026-10-28T10:00:00.000Z';
 const status=(auditDate,complete,detected,marked=markedAt)=>{
  const completedUrls=new Set(complete?[page]:[]);
  const issueOccurrences=new Set(detected?[key]:[]);
  const siteReport={generatedAt:auditDate};
  const fn=Function('siteReport','completedUrls','issueOccurrences','return (key,item)=>{'+match[1]+'};')(siteReport,completedUrls,issueOccurrences);
  return fn(key,{status:'fixed',markedAt:marked});
 };
 assert.equal(status('2026-10-28T09:00:00.000Z',true,false),'Awaiting verification','Old audits cannot verify a new fix');
 assert.equal(status('2026-10-28T10:00:00.000Z',true,false),'Awaiting verification','Same-time audits cannot verify');
 assert.equal(status('2026-10-28T11:00:00.000Z',false,false),'Awaiting verification','Incomplete page cannot verify');
 assert.equal(status('2026-10-28T11:00:00.000Z',true,true),'Still detected','Later complete audit with issue present stays unresolved');
 assert.equal(status('2026-10-28T11:00:00.000Z',true,false),'Verified absent','Later complete audit without issue confirms absence');
 assert.equal(status('2026-10-28T11:00:00.000Z',true,false,'invalid'),'Awaiting verification','Invalid publication timestamp cannot verify');
});

test('filtered repairs explain verification outcomes without claiming rankings improved',()=>{
 const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("explanation.className='hint small repair-verification-explanation'"));
 assert.ok(html.includes('Run a new, complete audit of this page'));
 assert.ok(html.includes('A later complete audit still found this issue'));
 assert.ok(html.includes('This does not guarantee improved rankings'));
 assert.ok(html.includes('li.append(label,stateBadge,explanation,progress,link,instruction,guide)'));
});
