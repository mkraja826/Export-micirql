import {selectUnifiedPages,inspectUnifiedCapture,buildUnifiedHealthReport} from './analyzer.js';
import {selectQaLayoutSamples} from '../qa/layout-sampling.js';
import {chooseSecurityPages} from '../security/analyzer.js';
const $=id=>document.getElementById(id);
const input=$('url'),button=$('run'),form=$('audit'),status=$('extension-status'),bar=$('progress');
const REQUIRED=['discover','seo-http-evidence','qa-layout','links-sitemap','security-headers','performance-navigation'];
let connected=false,busy=false,latest=null;
function isCompatible(data){
 return data?.protocol===3&&Array.isArray(data.capabilities)&&
  REQUIRED.every(x=>data.capabilities.includes(x));
}
function ready(value){
 connected=value;button.disabled=busy||!value;
 status.textContent=value?'MiCirql Chrome extension connected. Unified read-only scan is available.':
  'Updated MiCirql Chrome extension v0.3.22+ is required for this scan.';
 $('extension-help').hidden=value;
}
window.addEventListener('message',e=>{
 if(e.source!==window||e.origin!==location.origin||e.data?.source!=='micirql-extension'||
  e.data.type!=='MICIRQL_EXTENSION_READY')return;
 ready(isCompatible(e.data));
});
function ping(){window.postMessage({source:'micirql-web',type:'MICIRQL_EXTENSION_PING',id:'unified-ping'},location.origin)}
ping();setTimeout(ping,800);setTimeout(()=>{if(!connected)ready(false)},1500);
function normalize(value){
 const raw=value.trim(),url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname)
  throw Error('Enter a valid HTTP(S) website without embedded credentials');
 url.search='';url.hash='';
 return url.href;
}
function request(type,replyType,url,timeoutMs=55000,progressType=null){
 return new Promise((resolve,reject)=>{
  const id='unified-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  let timeout=null;const started=Date.now(),hardLimit=1200000;
  const cleanup=()=>{clearTimeout(timeout);window.removeEventListener('message',listen)};
  const arm=()=>{
   clearTimeout(timeout);const left=Math.min(timeoutMs,hardLimit-(Date.now()-started));
   if(left<=0){cleanup();reject(Error('Extension safety timeout exceeded'));return}
   timeout=setTimeout(()=>{cleanup();reject(Error('No Chrome extension response within timeout'))},left);
  };
  const listen=event=>{
   if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'||
    event.data.id!==id)return;
   if(progressType&&event.data.type===progressType){
    const progress=event.data.progress||{};
    $('progress-text').textContent='Discovering pages: '+(progress.done||0)+
     ' inspected, '+(progress.found||0)+' found…';
    arm();return;
   }
   if(event.data.type!==replyType)return;
   cleanup();resolve(event.data);
  };
  window.addEventListener('message',listen);arm();
  window.postMessage({source:'micirql-web',type,id,url},location.origin);
 });
}
function progress(message,value){
 bar.value=Math.min(100,Math.max(0,Math.round(value)));
 $('progress-text').textContent=message;
}
function el(tag,content,css){
 const node=document.createElement(tag);if(css)node.className=css;
 node.textContent=String(content??'');return node;
}
function finding(target,title,description){
 const card=el('div','','finding');
 card.append(el('strong',title),el('p',description));
 target.append(card);
}
function metric(title,value){
 const card=el('div','','metric');
 card.append(el('strong',value),el('span',title));
 $('metrics').append(card);
}
function section(title,state,description){
 const container=el('section','','sect'),header=el('div','','sect-title');
 header.append(el('h2',title),el('span',state.replaceAll('_',' '),'mark'));
 container.append(header,el('p',description,'small muted'));$('sections').append(container);
 return container;
}
function displayFindings(container,findings,max=15){
 const data=Array.isArray(findings)?findings:[];
 if(!data.length){container.append(el('p','No review findings were recorded in the verified snapshots. This is not a full-site pass.','muted small'));return}
 for(const issue of data.slice(0,max)){
  const severity=issue.severity?' · '+issue.severity.toUpperCase():'';
  const pages=issue.affectedPages||[];
  finding(container,issue.label+severity,
   (issue.occurrences||0)+' occurrence(s) on '+pages.length+' page(s): '+pages.slice(0,3).join(', ')+
   (pages.length>3?' and more':''));
 }
 if(data.length>max)container.append(el('p',(data.length-max)+' additional finding groups are not expanded in this PDF. See affected page coverage and standalone tools.','small muted'));
}
function render(report){
 latest=report;$('results').hidden=false;$('website').textContent=report.website;
 $('date').textContent='Generated '+new Date(report.generatedAt).toLocaleString();
 $('metrics').replaceChildren();
 metric('Source pages checked',report.scope.sourcePagesComplete+' / '+report.scope.selectedPages);
 metric('Confirmed broken links',report.sections.links.report.summary.broken);
 metric('Responsive review signals',report.sections.responsive.report.summary.reviewSignals);
 metric('Security review candidates',report.sections.security.report.summary.reviewCandidates);
 $('coverage').textContent='Discoveries: '+report.scope.discoveredPages+' known page(s); '+
  report.scope.sourcePagesUnverified+' source page(s) unverified. '+(report.scope.discoveryTruncated?
  'Discovery reached a page limit or could be truncated. ':'')+
  'SEO, QA, accessibility and links reuse the same page snapshots. Each tool has separate coverage and no global health score is assigned.';
 $('priorities').replaceChildren();
 if(!report.priorities.length)finding($('priorities'),'No prioritized issue recorded',
  'An absence of recorded issues is not proof of complete website health.');
 for(const priority of report.priorities){
  finding($('priorities'),priority.priority.toUpperCase()+' · '+priority.source+' · '+priority.title,
   priority.evidence+' · '+(priority.details||''));
 }
 $('sections').replaceChildren();
 const seo=report.sections.seo;
 let block=section('SEO inspection',seo.status,seo.checked+' / '+seo.total+
  ' HTML snapshots checked. Per-page scores are heuristic; they are not Google rankings or an overall website grade.');
 displayFindings(block,seo.findings,18);
 const perPage=el('div','','small');
 perPage.append(el('h3','Per-page SEO HTML scores'));
 for(const row of seo.perPage)perPage.append(el('p',row.url+' · '+(Number.isFinite(row.score)?row.score+'/100':'Not scored')+
  ' (heuristic HTML score; '+row.scoringVersion+')','small'));
 block.append(perPage);
 const qa=report.sections.qa;
 block=section('QA Testing Lab',qa.status,qa.checked+' / '+qa.total+
  ' shared HTML snapshots checked. This is structural inspection, not form submissions or user-journey testing.');
 displayFindings(block,qa.findings,18);
 const links=report.sections.links,lr=links.report;
 block=section('Link & Sitemap Inspector',links.status,
  links.checked+' of '+links.total+' unique internal destinations had observed HTTP responses. '+
  lr.summary.broken+' confirmed 404/410, '+lr.summary.serverErrors+' HTTP 5xx, '+
  lr.summary.unverified+' unverified, '+lr.summary.notChecked+' not checked.');
 block.append(el('p','Sitemap: '+lr.sitemap.state+' · '+lr.sitemap.message,'small'));
 for(const link of lr.links.filter(x=>x.classification==='broken'||x.classification==='server_error').slice(0,40)){
  finding(block,link.destination+' · HTTP '+link.status,'Linked from: '+link.referringPages.slice(0,5).join(', '));
 }
 if(!lr.summary.broken&&!lr.summary.serverErrors)block.append(el('p','No confirmed 404/410 or 5xx destinations observed. Unchecked and blocked URLs are not marked healthy.','muted small'));
 const responsive=report.sections.responsive,rr=responsive.report;
 block=section('Responsive Lab',responsive.status,responsive.checked+'/'+responsive.total+
  ' viewport observations checked on '+rr.coverage.sampledPages+' page(s) at 375px, 768px and 1440px.');
 for(const item of rr.signals.slice(0,25))finding(block,item.width+'px · '+item.code,
  item.url+' · '+item.summary);
 if(!rr.signals.length)block.append(el('p','No review signals were observed; clipping and visual overlap were not independently verified.','small muted'));
 const accessibility=report.sections.accessibility,ar=accessibility.report;
 block=section('Accessibility Studio',accessibility.status,
  ar.coverage.completePages+' / '+ar.coverage.selectedPages+' source snapshots checked; '+
  ar.summary.sourceReviewSignals+' source review signals, '+ar.summary.browserReviewSignals+' browser review signals.');
 const groups=new Map();
 for(const pg of ar.pages.filter(x=>x.status==='complete'))for(const g of pg.groups){
  if(!groups.has(g.code))groups.set(g.code,{label:g.label,count:0,urls:new Set()});
  const item=groups.get(g.code);item.count+=g.count;item.urls.add(pg.url);
 }
 for(const item of [...groups.values()].slice(0,18))
  finding(block,item.label+' · '+item.count+' review candidate(s)',
   [...item.urls].slice(0,4).join(', '));
 if(!groups.size)block.append(el('p','No HTML accessibility candidates observed. Manual keyboard, contrast and screen-reader checks remain required.','muted small'));
 const sec=report.sections.security,sr=sec.report;
 block=section('Security Inspector',sec.status,
  sr.scope.observedResponses+' / '+sr.scope.sampledPages+
  ' public HTTP responses observed; '+sr.summary.reviewCandidates+' configuration review candidates.');
 for(const page of sr.pages){
  block.append(el('h3',page.url+' · '+page.state+(page.status?' ('+page.status+')':'')));
  if(page.state!=='observed'){block.append(el('p',page.reason||'Header response unavailable','small muted'));continue}
  for(const findingRow of page.checks.filter(x=>x.state==='review').slice(0,10))
   finding(block,findingRow.label, findingRow.detail);
 }
 block.append(el('p','No vulnerability testing, TLS certificate verification or security score was performed.','muted small'));
 const perf=report.sections.performance,pr=perf.report;
 block=section('Performance Lab',perf.status,
  perf.status==='checked'?'One local unthrottled Chrome navigation; not field Web Vitals.':
  'Performance navigation was unavailable, ineligible or unverified.');
 if(pr?.metrics)for(const [key,label] of [
  ['responseStartMs','Response start'],['domContentLoadedMs','DOM ready'],
  ['loadEventMs','Load event'],['firstContentfulPaintMs','First Contentful Paint']]){
  const value=pr.metrics[key];block.append(el('p',label+': '+(Number.isFinite(value)?value+' ms':'Not observed'),'small'));
 }
 block.append(el('p','LCP, CLS and INP: not measured. No Lighthouse or overall performance grade.','muted small'));
 const shot=report.sections.screenshots;
 block=section('Screenshot Studio',shot.status,shot.note);
 block.append(el('p','Screenshot ZIP generation remains an opt-in, separate tool.','small muted'));
 $('pages').replaceChildren();
 for(const page of report.pages){
  const tr=document.createElement('tr');
  tr.append(el('td',page.url),el('td',page.status),el('td',page.reason||'—'));
  $('pages').append(tr);
 }
 $('limitations').replaceChildren();
 for(const note of report.limitations)$('limitations').append(el('li',note));
 $('screenshots-link').href='/tools/screenshots/?url='+encodeURIComponent(report.website);
}
