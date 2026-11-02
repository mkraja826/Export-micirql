import {inspectQaHtml,QA_INSPECTOR_VERSION} from './inspector.js';
import {selectQaLayoutSamples} from './layout-sampling.js';
import {summarizeQaReport} from './report-summary.js';
import {evaluateQaExtensionHandshake} from './extension-compat.js';
import {summarizeQaDiscovery} from './discovery-coverage.js';

const $=id=>document.getElementById(id);
const urlInput=$('url'),run=$('run'),manual=$('manual'),download=$('download'),print=$('print');
const status=$('extension-status'),setup=$('setup'),progressWrap=$('progress-wrap'),results=$('results');
let connected=false,layoutSupported=false,extensionResponded=false,busy=false,currentReport=null;
const preset=new URLSearchParams(location.search).get('url');
if(preset)urlInput.value=preset;
function normalize(raw){
 const value=String(raw||'').trim();
 if(!value)throw Error('Enter a website address.');
 const target=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
 if(!['http:','https:'].includes(target.protocol)||!target.hostname||target.username||target.password)throw Error('Enter a valid HTTP or HTTPS website address.');
 target.hash='';return target;
}
function message(text,state='ready'){
 status.textContent=text;status.dataset.state=state;
}
function ping(){window.postMessage({source:'micirql-web',type:'MICIRQL_EXTENSION_PING'},location.origin)}
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'||event.data.type!=='MICIRQL_EXTENSION_READY')return;
 extensionResponded=true;
 const compatibility=evaluateQaExtensionHandshake(event.data);
 connected=compatibility.supported;
 layoutSupported=compatibility.layoutSupported;
 setup.hidden=compatibility.status==='ready';
 message(compatibility.message,compatibility.status);
});
ping();
setTimeout(()=>{if(!extensionResponded){setup.hidden=false;message('Chrome extension not detected. Install it to inspect live pages.','missing')}},1800);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)ping()});

function extensionRequest(type,resultType,url,timeout){
 return new Promise((resolve,reject)=>{
  const id='qa-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  let timer;
  const started=Date.now(),hardLimit=type==='MICIRQL_DISCOVER'?1800000:180000;
  function cleanup(){clearTimeout(timer);window.removeEventListener('message',receive)}
  function reset(){
   clearTimeout(timer);
   const left=hardLimit-(Date.now()-started);
   if(left<=0){cleanup();reject(Error('Browser inspection exceeded its safety limit.'));return}
   timer=setTimeout(()=>{cleanup();reject(Error('Chrome extension stopped responding. Check it is enabled and retry.'))},Math.min(timeout,left));
  }
  function receive(event){
   const response=event.data;
   if(event.source!==window||event.origin!==location.origin||response?.source!=='micirql-extension'||response.id!==id)return;
   if(type==='MICIRQL_DISCOVER'&&response.type==='MICIRQL_DISCOVER_PROGRESS'){
    const p=response.progress||{};
    $('progress-text').textContent='Discovering pages: '+(p.done||0)+' inspected · '+(p.found||0)+' found…';
    reset();return;
   }
   if(response.type!==resultType)return;
   cleanup();resolve(response);
  }
  window.addEventListener('message',receive);
  reset();
  window.postMessage({source:'micirql-web',type,id,url},location.origin);
 });
}
function node(tag,text,className){
 const element=document.createElement(tag);
 if(text!==undefined)element.textContent=String(text);
 if(className)element.className=className;
 return element;
}
function updateProgress(done,total,label){
 progressWrap.hidden=false;
 $('progress').value=total?Math.round(done/total*100):0;
 $('progress-text').textContent=label;
}
function render(report){
 currentReport=report;results.hidden=false;download.disabled=false;print.disabled=false;
 $('report-site').textContent=report.website;
 $('report-time').textContent='Generated '+new Date(report.generatedAt).toLocaleString()+' · '+report.inspectorVersion;
 const evidenceSummary=summarizeQaReport(report);
 const metrics=$('metrics');metrics.replaceChildren();
 const counts=[['Complete HTML pages',evidenceSummary.completePages],['Complete HTML findings',evidenceSummary.completeFindings],['Unverified HTML pages',evidenceSummary.failedPages+evidenceSummary.partialPages],['Layout pages observed',Number.isFinite(report.layoutPagesVerified)?report.layoutPagesVerified:0]];
 for(const [label,value] of counts){
  const item=node('div',undefined,'metric');item.append(node('strong',value),node('span',label));metrics.append(item);
 }
 const discovery=report.discovery||null;
 const discoveryIncomplete=discovery&&discovery.status!=='completed';
 const complete=report.pagesAnalyzed===report.pagesSelected&&!report.truncated&&!report.partialPages&&!report.failures.length&&!discoveryIncomplete;
 const summary=$('summary');
 summary.textContent=(report.pagesAnalyzed===0?'No pages received a complete HTML inspection. ':
  complete?'All selected public pages were inspected. ':'Coverage is incomplete. ')+
  report.pagesAnalyzed+' of '+report.pagesSelected+' selected page(s) verified'+
  (report.truncated?' · Discovery was limited to 60 pages':'')+
  (report.partialPages?' · '+report.partialPages+' incomplete capture(s)':'')+
  (discoveryIncomplete?' · Discovery coverage requires review':'')+'.';
 const discoverySummary=$('discovery-summary'),discoveryErrors=$('discovery-errors');
 discoveryErrors.replaceChildren();
 if(!discovery){
  discoverySummary.textContent='Discovery not assessed in this report. Pasted HTML and earlier reports cannot establish crawl coverage.';
 }else{
  const scanned=discovery.scanned===null?'not reported by the extension':discovery.scanned+' attempted URL(s)';
  const resultText='Chrome discovery: '+scanned+' · '+discovery.selected+' reachable page(s) selected · '+discovery.failed+
   ' URL(s) not reached during discovery'+(discovery.reportedUnaccounted>0?' · '+discovery.reportedUnaccounted+' attempted URL(s) without detailed outcomes':'')+
   (discovery.truncated?' · More pages may exist beyond the 60-page limit':'')+'.';
  const caution=discovery.status==='completed'?'All discovered URLs attempted within this crawl cap; this does not prove every website page exists in the crawl.':
   'Crawl coverage is incomplete or unconfirmed. Unreached pages have no QA findings and are not counted as healthy.';
  discoverySummary.textContent=resultText+' '+caution+(discovery.error?' Discovery error: '+discovery.error+'.':'');
  for(const issue of discovery.errors||[]){
   const entry=node('details');
   entry.append(node('summary',issue.url+' · discovery not verified'),
    node('p',issue.reason,'page-status'));
   discoveryErrors.append(entry);
  }
  if(discovery.reportedUnaccounted>0)discoveryErrors.append(node('p',
   discovery.reportedUnaccounted+' discovery attempt(s) have no page-level outcome in the extension response. Their URLs are unavailable; do not assume they were healthy.','small'));
 }
 const priorityCount=$('priority-count'),priorityFindings=$('priority-findings'),provisional=$('provisional-summary');
 priorityFindings.replaceChildren();
 if(evidenceSummary.completePages===0){
  priorityCount.textContent='No complete HTML snapshots are available, so nothing can be prioritized. This is not a passed QA audit.';
 }else if(evidenceSummary.issues.length===0){
  priorityCount.textContent='No concerns detected by these static HTML checks across '+evidenceSummary.completePages+' complete page(s). Functional behavior and accessibility conformance remain unverified.';
 }else{
  const top=evidenceSummary.issues.slice(0,8);
  priorityCount.textContent='Showing '+top.length+' of '+evidenceSummary.issueTypes+' issue types from '+evidenceSummary.completePages+' complete HTML page(s), ranked by review severity and affected-page count. These are checks to review, not verified functional failures.';
  for(const issue of top){
   const card=node('div',undefined,'priority-item');card.dataset.severity=issue.severity;
   const label=issue.severity==='medium'?'Review first':issue.severity==='low'?'Review next':'Advisory';
   card.append(node('strong',issue.label),
    node('p',label+' · '+issue.affectedPages+' affected page(s) · '+issue.occurrences+' finding(s)','priority-meta'),
    node('p',issue.message),
    node('p','Example page'+(issue.examplePages.length>1?'s':'')+': '+issue.examplePages.join(' · '),'small'));
   priorityFindings.append(card);
  }
 }
 const pending=evidenceSummary.partialPages+evidenceSummary.failedPages;
 provisional.textContent=(pending?
  'Not verified during HTML inspection: '+evidenceSummary.partialPages+' partial HTML capture(s) with '+evidenceSummary.provisionalFindings+' provisional observation(s), and '+evidenceSummary.failedPages+' failed page capture(s). Their findings are excluded from the priorities above; retry these pages before concluding they are healthy.':
  'HTML capture coverage: no partial or failed captures of selected pages. Responsive observations remain a separate sample.')+
  (discoveryIncomplete?' Discovery failures and unvisited URLs are listed separately above and are excluded from these HTML issue rankings.':'');
 const layoutSummary=$('layout-summary'),layoutDetails=$('layout-details');
 layoutDetails.replaceChildren();
 const layoutRecords=Array.isArray(report.layoutInspections)?report.layoutInspections
  :report.layoutInspection?[report.layoutInspection]:[];
 const requested=Number.isFinite(report.layoutPagesRequested)?report.layoutPagesRequested:layoutRecords.length;
 const checked=layoutRecords.filter(entry=>entry?.ok&&Array.isArray(entry.observations)&&entry.observations.some(item=>item.verified===true)).length;
 const verifiedViewports=layoutRecords.reduce((n,entry)=>n+(Array.isArray(entry.observations)?entry.observations.filter(item=>item.verified===true).length:0),0);
 if(!layoutRecords.length){
  layoutSummary.textContent='Not checked. Responsive and rendered-control observations require an updated MiCirql Chrome extension and at least one complete HTML capture.';
 }else{
  layoutSummary.textContent='Read-only browser evidence for '+checked+' of '+requested+' sampled pages ('+verifiedViewports+' of '+(requested*3)+' viewport checks). HTML was inspected on '+report.pagesAnalyzed+' pages. The sample prioritizes the entry page and a form page where available, then other pages; it does not establish complete-site responsive or functional correctness.';
  for(const evidence of layoutRecords){
   const details=node('details');
   details.open=true;
   details.append(node('summary',(evidence.url||evidence.requestedUrl||report.website)+' · '+(evidence.ok?'browser observations':'not verified')));
   if(!evidence.ok){
    details.append(node('p','Layout could not be verified: '+(evidence.error||'Chrome did not return evidence.'),'notice alert'));
    layoutDetails.append(details);continue;
   }
   const observed=Array.isArray(evidence.observations)?evidence.observations:[];
   for(const item of observed){
    const panel=node('div',undefined,'finding');
    panel.append(node('strong',item.width+'px '+(item.verified?'· observed viewport':'· unverified viewport')));
    if(item.verified){
     panel.append(node('p','CSS document width: '+item.documentWidth+'px · Horizontal overflow within CSS layout: '+item.horizontalOverflowPx+'px · Visible form fields: '+item.visibleFormControls+' · Unlabelled fields: '+item.unlabelledVisibleFields+' · Navigation links without names: '+item.unnamedNavigationLinks));
     if(item.width===375&&item.scaledMobileLayout===true){
      const note=item.missingMobileViewportMeta===true
       ?'Mobile review: no viewport meta declaration detected. Chrome emulated a 375px device, but the page used a '+item.observedWidth+'px CSS layout viewport and scaled it down. Zero horizontal overflow does not demonstrate mobile responsiveness.'
       :'Mobile review: Chrome emulated a 375px device, but the CSS layout viewport was '+item.observedWidth+'px. The page may scale down on phones; review its viewport settings and text readability.';
      panel.append(node('p',note,'notice'));
      panel.dataset.severity='medium';
     }else if(item.width===375&&item.missingMobileViewportMeta===true){
      panel.append(node('p','Mobile review: no viewport meta declaration was detected in the captured document. Check its intended viewport behavior.','small'));
     }
     if(Number.isFinite(item.placeholderNavigationLinks)){
      panel.append(node('p','Navigation targets: '+item.navigationLinks+' visible links · '+item.placeholderNavigationLinks+' empty or placeholder destinations · '+item.scriptedNavigationLinks+' script/data destinations · '+item.missingNavigationFragmentTargets+' in-page fragments without matching IDs.'));
      panel.append(node('p','Form controls: '+item.requiredVisibleFields+' visible required fields · '+item.implicitSubmitButtons+' buttons without an explicit type inside forms (may submit when activated).'));
     }else panel.append(node('p','Navigation target and form-button checks unavailable in this extension version. Update the extension for these read-only observations.'));
     if(Number.isFinite(item.buttonsWithoutNames)){
      panel.append(node('p','Keyboard and form review: '+item.buttonsWithoutNames+' visible buttons without detectable names · '+item.customControlsWithoutTabFocus+' custom button/link roles with negative tab order · '+item.navigationWithoutTabFocus+' navigation links with negative tab order · '+item.requiredFieldsWithoutLabels+' required fields without detected labels.'));
      panel.append(node('p','Target-size review: '+item.smallNavigationTargets+' visible navigation targets smaller than 24px in at least one dimension. Spacing, inline-text and other exceptions were not evaluated; these are not confirmed accessibility failures.'));
     }else panel.append(node('p','Keyboard, button-name and target-size observations unavailable in this extension version. Update the extension for these review counts.'));
     if(item.horizontalOverflowPx>8)panel.dataset.severity='medium';
    }else panel.append(node('p',item.reason||'The viewport could not be measured.'));
    details.append(panel);
   }
   layoutDetails.append(details);
  }
 }
 const pages=$('pages');pages.replaceChildren();
 const orderedPages=[...(Array.isArray(report.reports)?report.reports:[])].sort((a,b)=>{
  const priority=page=>{
   if(page.partial)return 4;
   const severities=(page.findings||[]).map(item=>item.severity);
   if(severities.includes('medium'))return 0;
   if(severities.includes('low'))return 1;
   if(severities.includes('info'))return 2;
   return 3;
  };
  return priority(a)-priority(b);
 });
 $('page-list-summary').textContent='Pages with higher-priority complete HTML findings appear first. '+evidenceSummary.completePages+' complete · '+evidenceSummary.partialPages+' provisional · '+evidenceSummary.failedPages+' HTML capture failures. Discovery failures are listed separately above. Layout observations are listed separately.';
 for(const page of orderedPages){
  const details=node('details');
  const issueCount=Array.isArray(page.findings)?page.findings.length:0;
  const pageStatus=page.partial?
   'Partial HTML capture — provisional observations only, not part of prioritized findings.':
   issueCount?
    'Complete HTML snapshot — static checks only; not a functional QA pass.':
    'No concerns detected in this complete HTML snapshot; functional behavior remains unverified.';
  details.append(node('summary',page.url+' · '+issueCount+(page.partial?' provisional observation(s)':' HTML finding(s)')),
   node('p',pageStatus,'page-status'));
  // A clean page needs just one clear status line, not two repeated disclaimers.
  for(const finding of page.findings||[]){
   const card=node('div',undefined,'finding');card.dataset.severity=finding.severity;
   card.append(node('strong',finding.severity.toUpperCase()+' · '+finding.code),
    node('p',finding.message+(finding.evidence?' · '+finding.evidence:'')));
   details.append(card);
  }
  pages.append(details);
 }
 for(const failure of report.failures||[]){
  const details=node('details');details.append(node('summary',failure.url+' · not checked'),node('p',failure.reason,'notice alert'));pages.append(details);
 }
 if(!pages.children.length)pages.append(node('p','No pages were available to inspect.'));
}
async function scan(url){
 if(!connected)throw Error('Install or update the MiCirql Chrome extension (inspection protocol v3) in desktop Chrome before running a live scan.');
 updateProgress(0,1,'Discovering public website pages in Chrome…');
 const discovered=await extensionRequest('MICIRQL_DISCOVER','MICIRQL_DISCOVER_RESULT',url.href,180000);
 const entries=Array.isArray(discovered.pages)?discovered.pages:[];
 const pages=[];
 for(const entry of entries){
  try{
   const target=normalize(entry);
   if(target.origin===url.origin&&!pages.includes(target.href)){
    pages.push(target.href);if(pages.length===60)break;
   }
  }catch{}
 }
 // Keep discovery failures in the report even if zero pages are reachable.
 // A zero-page result must never masquerade as a clean audit.
 const discovery=summarizeQaDiscovery(url.href,discovered,pages);
 const reports=[],failures=[];
 const layoutBudget=layoutSupported?Math.min(3,pages.length):0;
 const progressTotal=pages.length+layoutBudget;
 for(let i=0;i<pages.length;i++){
  updateProgress(i,progressTotal,'Inspecting HTML page '+(i+1)+' of '+pages.length+'…');
  try{
   const response=await extensionRequest('MICIRQL_SEO_READ','MICIRQL_SEO_RESULT',pages[i],90000);
   if(!response.ok)throw Error(response.error||'Page capture failed.');
   const finalUrl=normalize(response.url||pages[i]);
   if(finalUrl.origin!==url.origin)throw Error('Page redirected outside the selected website; excluded.');
   const inspected=inspectQaHtml(response.html,finalUrl.href,{partial:response.partial===true});
   inspected.requestedUrl=pages[i];reports.push(inspected);
  }catch(error){failures.push({url:pages[i],reason:error.message||'Could not inspect the page'});}
  updateProgress(i+1,progressTotal,'Checked '+(i+1)+' of '+pages.length+' HTML pages');
 }
 const partialPages=reports.filter(page=>page.partial).length;
 // Layout evidence is intentionally capped at three complete HTML pages, not 60.
 // Prefer the entry page, then a page with form controls, then the next distinct page.
 // Navigating to these public pages is read-only; no buttons are clicked or forms submitted.
 const sampledPages=layoutSupported?selectQaLayoutSamples(reports,url.href,3):[];
 const layoutInspections=[];
 for(let i=0;i<sampledPages.length;i++){
  const selectedUrl=sampledPages[i].requestedUrl||sampledPages[i].url;
  updateProgress(pages.length+i,progressTotal,'Observing layout '+(i+1)+' of '+sampledPages.length+' sampled pages at 375, 768 and 1440px…');
  try{
   const layout=await extensionRequest('MICIRQL_QA_LAYOUT','MICIRQL_QA_LAYOUT_RESULT',selectedUrl,90000);
   layoutInspections.push(layout.ok?
    {ok:true,requestedUrl:selectedUrl,url:layout.url||selectedUrl,observations:Array.isArray(layout.observations)?layout.observations:[]}
    :{ok:false,requestedUrl:selectedUrl,error:layout.error||'Browser observation failed'});
  }catch(error){
   layoutInspections.push({ok:false,requestedUrl:selectedUrl,error:error.message||'Browser observation timed out'});
  }
  updateProgress(pages.length+i+1,progressTotal,'Observed '+(i+1)+' of '+sampledPages.length+' selected layout pages');
 }
 updateProgress(progressTotal,progressTotal,'Inspection complete. Review the report and save the PDF.');
 const layoutPagesVerified=layoutInspections.filter(entry=>entry.ok&&entry.observations.some(item=>item.verified===true)).length;
 // Retain a single-entry alias for previously saved reports and consumers.
 const layoutInspection=layoutInspections[0]||null;
 return {schemaVersion:1,tool:'qa-lab',inspectorVersion:QA_INSPECTOR_VERSION,generatedAt:new Date().toISOString(),
  website:url.origin,pagesDiscovered:discovered.originalCount??entries.length,pagesSelected:pages.length,discovery,
  pagesAnalyzed:reports.length-partialPages,partialPages,truncated:Boolean(discovered.truncated||entries.length>60),
  reports,failures,layoutInspection,layoutInspections,layoutPagesRequested:sampledPages.length,layoutPagesVerified,
  layoutSamplingLimit:3,totalFindings:reports.reduce((n,page)=>n+page.findings.length,0),
  scope:'browser_captured_static_html_with_bounded_read_only_layout_sample',limitations:['Static HTML inspected on up to 60 pages; rendered viewport evidence sampled on no more than three complete pages','No functional form submissions or navigation journey testing','No verified external link status','Incomplete captures remain provisional']};
}
async function runScan(event){
 event.preventDefault();
 if(busy)return;
 busy=true;run.disabled=true;manual.disabled=true;print.disabled=true;download.disabled=true;
 currentReport=null;results.hidden=true;
 try{
  const url=normalize(urlInput.value);urlInput.value=url.href;
  const report=await scan(url);render(report);
  $('progress-text').textContent='Inspection complete. Review the report and choose Save as PDF.';
 }catch(error){
  updateProgress(0,1,'Inspection stopped: '+(error.message||'Unknown error'));
  message(error.message||'Inspection failed.','error');
  if(!connected)setup.hidden=false;
 }finally{busy=false;run.disabled=false;manual.disabled=false}
}
$('audit').addEventListener('submit',runScan);
manual.addEventListener('click',()=>{
 if(busy)return;
 try{
  const url=normalize(urlInput.value),html=$('html').value;
  if(!html.trim())throw Error('Paste a public HTML snapshot before inspecting.');
  const page=inspectQaHtml(html,url.href);
  progressWrap.hidden=true;
  render({schemaVersion:1,tool:'qa-lab',inspectorVersion:QA_INSPECTOR_VERSION,generatedAt:new Date().toISOString(),
   website:url.origin,pagesDiscovered:1,pagesSelected:1,pagesAnalyzed:1,partialPages:0,truncated:false,discovery:null,
   reports:[page],failures:[],totalFindings:page.findings.length,scope:'pasted_html_only'});
 }catch(error){updateProgress(0,1,error.message)}
});
let priorPrintDetails=null;
window.addEventListener('beforeprint',()=>{
 if(!currentReport)return;
 const printableDetails=[...$('discovery-errors').querySelectorAll('details'),...$('layout-details').querySelectorAll('details'),...$('pages').querySelectorAll('details')];
 priorPrintDetails=printableDetails.map(item=>({item,open:item.open}));
 for(const {item} of priorPrintDetails)item.open=true;
});
window.addEventListener('afterprint',()=>{
 if(!priorPrintDetails)return;
 for(const {item,open} of priorPrintDetails)item.open=open;
 priorPrintDetails=null;
});
print.addEventListener('click',()=>{if(currentReport)window.print()});
download.addEventListener('click',()=>{
 if(!currentReport)return;
 const blob=new Blob([JSON.stringify(currentReport,null,2)],{type:'application/json'});
 const objectUrl=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=objectUrl;link.download='micirql-qa-report.json';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
});
