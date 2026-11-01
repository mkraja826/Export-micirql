import {inspectQaHtml,QA_INSPECTOR_VERSION} from './inspector.js';

const $=id=>document.getElementById(id);
const urlInput=$('url'),run=$('run'),manual=$('manual'),download=$('download'),print=$('print');
const status=$('extension-status'),setup=$('setup'),progressWrap=$('progress-wrap'),results=$('results');
let connected=false,layoutSupported=false,busy=false,currentReport=null;
const preset=new URLSearchParams(location.search).get('url');
if(preset)urlInput.value=preset;
function normalize(raw){
 const value=String(raw||'').trim();
 if(!value)throw Error('Enter a website address.');
 const target=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
 if(!['http:','https:'].includes(target.protocol)||!target.hostname||target.username||target.password)throw Error('Enter a valid HTTP or HTTPS website address.');
 target.hash='';return target;
}
function message(text,error=false){
 status.textContent=text;status.dataset.state=error?'error':'ready';
}
function ping(){window.postMessage({source:'micirql-web',type:'MICIRQL_EXTENSION_PING'},location.origin)}
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'||event.data.type!=='MICIRQL_EXTENSION_READY')return;
 connected=true;layoutSupported=Array.isArray(event.data.capabilities)&&event.data.capabilities.includes('qa-layout');
 setup.hidden=true;message('MiCirql Chrome extension connected. '+(layoutSupported?'Responsive layout evidence available.':'Update the extension to include responsive layout checks.'));

});
ping();
setTimeout(()=>{if(!connected){setup.hidden=false;message('Chrome extension not detected. Install it to inspect live pages.',true)}},1800);
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
 const metrics=$('metrics');metrics.replaceChildren();
 const counts=[['Pages verified',report.pagesAnalyzed],['Findings',report.totalFindings],['Pages not verified',report.failures.length+report.partialPages]];
 for(const [label,value] of counts){
  const item=node('div',undefined,'metric');item.append(node('strong',value),node('span',label));metrics.append(item);
 }
 const complete=report.pagesAnalyzed===report.pagesSelected&&!report.truncated&&!report.partialPages&&!report.failures.length;
 const summary=$('summary');
 summary.textContent=(report.pagesAnalyzed===0?'No pages received a complete HTML inspection. ':
  complete?'All selected public pages were inspected. ':'Coverage is incomplete. ')+
  report.pagesAnalyzed+' of '+report.pagesSelected+' selected page(s) verified'+
  (report.truncated?' · Discovery was limited to 60 pages':'')+
  (report.partialPages?' · '+report.partialPages+' incomplete capture(s)':'')+'.';
 const layoutSummary=$('layout-summary'),layoutDetails=$('layout-details');
 layoutDetails.replaceChildren();
 const evidence=report.layoutInspection;
 if(!evidence){
  layoutSummary.textContent='Not checked. No browser layout observations are available for this report.';
 }else if(!evidence.ok){
  layoutSummary.textContent='Responsive layout could not be verified: '+(evidence.error||'Chrome did not return evidence.');
 }else{
  const observed=Array.isArray(evidence.observations)?evidence.observations:[];
  const verified=observed.filter(item=>item.verified===true);
  layoutSummary.textContent='Read-only DOM observations for one page ('+evidence.url+'). Verified '+verified.length+' of 3 viewport widths. Findings below are element/target evidence, not proof of successful navigation, form submission, or accessibility conformance.';
  for(const item of observed){
   const panel=node('div',undefined,'finding');
   const title=item.width+'px '+(item.verified?'· verified viewport':'· unverified viewport');
   panel.append(node('strong',title));
   if(item.verified){
    panel.append(node('p','Document width: '+item.documentWidth+'px · Horizontal overflow: '+item.horizontalOverflowPx+'px · Visible form fields: '+item.visibleFormControls+' · Unlabelled fields: '+item.unlabelledVisibleFields+' · Navigation links without names: '+item.unnamedNavigationLinks));
    if(Number.isFinite(item.placeholderNavigationLinks)){
     panel.append(node('p','Navigation targets: '+item.navigationLinks+' visible links · '+item.placeholderNavigationLinks+' empty or placeholder destinations · '+item.scriptedNavigationLinks+' script/data destinations · '+item.missingNavigationFragmentTargets+' in-page fragments without matching IDs.'));
     panel.append(node('p','Form controls: '+item.requiredVisibleFields+' visible required fields · '+item.implicitSubmitButtons+' buttons without an explicit type inside forms (may submit when activated).'));
    }else panel.append(node('p','Navigation target and form-button checks unavailable in this extension version. Update the extension for these read-only observations.'));
    if(item.horizontalOverflowPx>8)panel.dataset.severity='medium';
   }else panel.append(node('p',item.reason||'The viewport could not be measured.'));
   layoutDetails.append(panel);
  }
 }
 const pages=$('pages');pages.replaceChildren();
 for(const page of report.reports){
  const details=node('details');
  details.append(node('summary',page.url+' · '+page.findings.length+' finding(s)'),
   node('p',page.partial?'Partial capture: treat findings as provisional.':'Complete HTML snapshot','page-status'));
  if(!page.findings.length)details.append(node('p','No concerns detected by these static checks. This does not establish a functional QA pass.'));
  for(const finding of page.findings){
   const card=node('div',undefined,'finding');card.dataset.severity=finding.severity;
   card.append(node('strong',finding.severity.toUpperCase()+' · '+finding.code),
    node('p',finding.message+(finding.evidence?' · '+finding.evidence:'')));
   details.append(card);
  }
  pages.append(details);
 }
 for(const failure of report.failures){
  const details=node('details');details.append(node('summary',failure.url+' · not checked'),node('p',failure.reason,'notice alert'));pages.append(details);
 }
 if(!pages.children.length)pages.append(node('p','No pages were available to inspect.'));
}
async function scan(url){
 if(!connected)throw Error('Connect the MiCirql Chrome extension in desktop Chrome before running a live scan.');
 updateProgress(0,1,'Discovering public website pages in Chrome…');
 const discovered=await extensionRequest('MICIRQL_DISCOVER','MICIRQL_DISCOVER_RESULT',url.href,180000);
 if(discovered.ok===false)throw Error(discovered.error||'Page discovery failed.');
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
 if(!pages.length)throw Error('No public pages could be discovered. Check the URL and extension permissions.');
 const reports=[],failures=[];
 for(let i=0;i<pages.length;i++){
  updateProgress(i,pages.length,'Inspecting '+(i+1)+' of '+pages.length+' pages…');
  try{
   const response=await extensionRequest('MICIRQL_SEO_READ','MICIRQL_SEO_RESULT',pages[i],90000);
   if(!response.ok)throw Error(response.error||'Page capture failed.');
   const finalUrl=normalize(response.url||pages[i]);
   if(finalUrl.origin!==url.origin)throw Error('Page redirected outside the selected website; excluded.');
   const inspected=inspectQaHtml(response.html,finalUrl.href,{partial:response.partial===true});
   inspected.requestedUrl=pages[i];reports.push(inspected);
  }catch(error){failures.push({url:pages[i],reason:error.message||'Could not inspect the page'});}
  updateProgress(i+1,pages.length,'Checked '+(i+1)+' of '+pages.length+' selected pages');
 }
 const partialPages=reports.filter(page=>page.partial).length;
 // Read-only layout observation samples the requested entry page. It does not
 // click buttons, submit forms or imply that other pages were viewport-tested.
 let layoutInspection=null;
 if(layoutSupported){
  updateProgress(pages.length,pages.length,'Checking homepage layout at 375, 768 and 1440px…');
  try{
   const layout=await extensionRequest('MICIRQL_QA_LAYOUT','MICIRQL_QA_LAYOUT_RESULT',url.href,90000);
   layoutInspection=layout.ok?{ok:true,url:layout.url||url.href,observations:Array.isArray(layout.observations)?layout.observations:[]}
    :{ok:false,error:layout.error||'Browser layout inspection failed'};
  }catch(error){layoutInspection={ok:false,error:error.message||'Browser layout inspection timed out'};}
 }
 return {schemaVersion:1,tool:'qa-lab',inspectorVersion:QA_INSPECTOR_VERSION,generatedAt:new Date().toISOString(),
  website:url.origin,pagesDiscovered:discovered.originalCount??entries.length,pagesSelected:pages.length,
  pagesAnalyzed:reports.length-partialPages,partialPages,truncated:Boolean(discovered.truncated||entries.length>60),
  reports,failures,layoutInspection,totalFindings:reports.reduce((n,page)=>n+page.findings.length,0),
  scope:'browser_captured_static_html',limitations:['No functional form or navigation checks','No verified external link status','Incomplete captures remain provisional']};
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
  message(error.message||'Inspection failed.',true);
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
   website:url.origin,pagesDiscovered:1,pagesSelected:1,pagesAnalyzed:1,partialPages:0,truncated:false,
   reports:[page],failures:[],totalFindings:page.findings.length,scope:'pasted_html_only'});
 }catch(error){updateProgress(0,1,error.message)}
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
