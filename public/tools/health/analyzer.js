// MiCirql Unified Website Health: a read-only report assembled from the SAME
// HTML capture for SEO + QA + Accessibility + link targets. Other browser
// observations remain individually scoped. No score is synthesized.
import {inspectSeoHtml} from '../seo/inspector.js';
import {inspectQaHtml} from '../qa/inspector.js';
import {inspectAccessibilityCapture,summarizeAccessibilityReport} from '../accessibility/analyzer.js';
import {buildLinkAudit} from '../links/analyzer.js';
import {buildResponsiveReport} from '../responsive/analyzer.js';
import {buildSecurityReport} from '../security/analyzer.js';
import {buildPerformanceReport} from '../performance/analyzer.js';
export const UNIFIED_MAX_PAGES=60;
export const UNIFIED_LINK_LIMIT=60;
export const UNIFIED_LAYOUT_LIMIT=3;
const valid=value=>{
 try{
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  u.search='';u.hash='';return u.href;
 }catch{return null}
};
export function selectUnifiedPages(discovery,website,limit=UNIFIED_MAX_PAGES){
 const entry=valid(website);if(!entry)throw Error('Enter a valid HTTP(S) website URL');
 if(!Number.isInteger(limit)||limit<1||limit>UNIFIED_MAX_PAGES)throw Error('Page cap must be between 1 and 60');
 const base=new URL(entry).origin;
 const pages=new Set([entry]);
 for(const value of Array.isArray(discovery)?discovery:[]){
  const url=valid(value);
  if(url&&new URL(url).origin===base)pages.add(url);
  if(pages.size>=limit)break;
 }
 return [...pages];
}
function unfinished(url,reason){
 return {url,status:'unverified',reason:String(reason||'capture_not_verified').slice(0,160),
  seo:null,qa:null,accessibility:null,linkTargets:[]};
}
export function inspectUnifiedCapture({requestedUrl,result}){
 const url=valid(requestedUrl);
 if(!url)throw Error('Invalid page URL');
 if(!result?.ok)return unfinished(url,result?.error||'html_capture_failed');
 const returned=valid(result.url||url);
 if(returned!==url)return unfinished(url,'captured_url_mismatch_or_redirect');
 if(result.partial===true||typeof result.html!=='string'||!result.html.trim())
  return unfinished(url,'incomplete_or_missing_html');
 const http=result.httpEvidence;
 if(http?.observed===true&&Number.isInteger(http.status)&&http.status>=400)
  return unfinished(url,'http_'+http.status+'_error_response');
 try{
  const seo=inspectSeoHtml(result.html,url,{partial:false});
  if(seo.auditStatus!=='complete'||seo.partial===true)return unfinished(url,'seo_html_not_complete');
  const qa=inspectQaHtml(result.html,url,{partial:false});
  if(qa.auditStatus!=='complete'||qa.partial===true)return unfinished(url,'qa_html_not_complete');
  const accessibility=inspectAccessibilityCapture({url,html:result.html,httpStatus:http?.observed?http.status:null});
  if(accessibility.status!=='complete')return unfinished(url,'accessibility_html_not_complete');
  return {url,status:'complete',reason:null,
   seo:{score:Number.isFinite(seo.score)?seo.score:null,scoringVersion:seo.scoringVersion,
    findings:seo.findings||[],title:String(seo.title||'').slice(0,180)},
   qa:{counts:qa.counts,findings:qa.findings||[]},
   accessibility,linkTargets:(seo.internalLinkTargets||[]).slice(0,500),
   http:{observed:http?.observed===true,status:http?.observed?http.status:null}};
 }catch(error){
  return unfinished(url,'inspection_error: '+String(error?.message||error));
 }
}
function coverage(done,total){
 return {status:total===0||done===0?'not_verified':done===total?'checked':'partial',
  checked:done,total,unverified:total-done};
}
function groupFindings(pages,field){
 const groups=new Map();
 for(const page of pages.filter(p=>p.status==='complete')){
  for(const issue of page[field]?.findings||[]){
   const code=String(issue.code||'other').slice(0,65),severity=String(issue.severity||'review');
   const id=code+'|'+severity;
   if(!groups.has(id))groups.set(id,{code,severity,label:String(issue.message||code).slice(0,220),
    occurrences:0,affectedPages:[],exampleEvidence:[]});
   const row=groups.get(id);row.occurrences++;
   if(!row.affectedPages.includes(page.url))row.affectedPages.push(page.url);
   if(row.exampleEvidence.length<2&&issue.evidence){
    const evidence=typeof issue.evidence==='string'?issue.evidence:JSON.stringify(issue.evidence);
    row.exampleEvidence.push(evidence.slice(0,160));
   }
  }
 }
 return [...groups.values()].sort((a,b)=>b.affectedPages.length-a.affectedPages.length||a.code.localeCompare(b.code));
}
export function buildUnifiedHealthReport({website,pages=[],discoveredPages=0,discoveryTruncated=false,
 linkDiagnostics=[],sitemap=null,layoutSamples=[],securitySamples=[],performanceObservation=null}){
 const entry=valid(website);
 if(!entry)throw Error('Invalid website URL');
 if(pages.length>UNIFIED_MAX_PAGES||layoutSamples.length>UNIFIED_LAYOUT_LIMIT||
  securitySamples.length>3||linkDiagnostics.length>UNIFIED_LINK_LIMIT)throw Error('Unified scan limits exceeded');
 const origin=new URL(entry).origin,seen=new Set();
 for(const page of pages){
  const url=valid(page?.url);
  if(!url||new URL(url).origin!==origin||seen.has(url)||!['complete','unverified'].includes(page.status))
   throw Error('Invalid or repeated source page');
  seen.add(url);
 }
 const complete=pages.filter(p=>p.status==='complete').length;
 const seoIssues=groupFindings(pages,'seo'),qaIssues=groupFindings(pages,'qa');
 const linkAudit=buildLinkAudit({website:entry,pages:pages.map(p=>({url:p.url,
  complete:p.status==='complete',reason:p.reason,targets:p.linkTargets})),
  diagnostics:linkDiagnostics,discovered:discoveredPages,discoveryTruncated,sitemap});
 const responsive=buildResponsiveReport({website:entry,discoveredPages,
  discoveryTruncated,samples:layoutSamples});
 const accessibility=summarizeAccessibilityReport({website:entry,pages:pages.map(p=>p.status==='complete'?
  p.accessibility:({url:p.url,status:'unverified',reason:p.reason,groups:[]})),
  layoutSamples:layoutSamples.map(s=>({url:s.requestedUrl,observations:s.observations})),
  discoveredPages,discoveryTruncated});
 const security=buildSecurityReport({website:entry,observations:securitySamples,
  discoveredPages,discoveryTruncated});
 let performance;
 try{performance=buildPerformanceReport({website:entry,observation:performanceObservation})}
 catch{performance={status:'not_verified',reason:'requested_url_not_eligible_for_performance_lab',
  metrics:null,resources:null,unavailableCoreWebVitals:{LCP:'not_measured',CLS:'not_measured',INP:'not_measured'}}}
 const sourceCoverage=coverage(complete,pages.length);
 const verifiedLinkChecks=linkAudit.summary.broken+linkAudit.summary.reachable+linkAudit.summary.serverErrors;
 const linksCoverage=coverage(verifiedLinkChecks,linkAudit.scope.uniqueInternalDestinations);
 const responsiveCoverage=coverage(responsive.coverage.verifiedViewportChecks,
  responsive.coverage.expectedViewportChecks);
 const securityCoverage=coverage(security.scope.observedResponses,security.scope.sampledPages);
 const report={
  schemaVersion:1,tool:'unified-health',generatedAt:new Date().toISOString(),website:entry,
  scope:{discoveredPages,selectedPages:pages.length,sourcePagesComplete:complete,
   sourcePagesUnverified:pages.length-complete,discoveryTruncated:discoveryTruncated===true,
   cap:UNIFIED_MAX_PAGES,sourceHtmlCaptures:pages.length,
   note:'SEO, QA, Accessibility and internal links share each successfully captured page snapshot.'},
  sections:{
   seo:{...sourceCoverage,findings:seoIssues,
    perPage:pages.filter(p=>p.status==='complete').map(p=>({url:p.url,score:p.seo.score,
     scoringVersion:p.seo.scoringVersion,title:p.seo.title})),
    note:'SEO HTML scores are per-page heuristics, not search rankings or a unified site score.'},
   qa:{...sourceCoverage,findings:qaIssues,note:'Static HTML review only; forms and journeys were not executed.'},
   links:{...linksCoverage,report:linkAudit},
   responsive:{...responsiveCoverage,report:responsive},
   accessibility:{...sourceCoverage,report:accessibility},
   security:{...securityCoverage,report:security},
   performance:{status:performance.status==='observed'?'checked':'not_verified',report:performance},
   screenshots:{status:'not_run',note:'Screenshot Studio ZIP capture is a separate, opt-in workflow; no image evidence was collected in this scan.'}
  },
  pages:pages.map(p=>({url:p.url,status:p.status,reason:p.reason})),
  limitations:[
   'This is a bounded, read-only website-quality inspection, not an automatic website repair service.',
   'No single health score is calculated; check coverage, severity and evidence for each section.',
   'Broken links require observed HTTP 404/410; blocked and unverified requests are not broken.',
   'Browser overflow is a review signal, not proof of clipping or overlap.',
   'Accessibility and passive security findings require manual review, not compliance or vulnerability certification.',
   'One local browser navigation does not establish real-user Core Web Vitals.',
   'Discovered pages and checked destinations may omit parts of large or dynamic websites.'
  ]
 };
 report.priorities=derivePriorities(report);
 return report;
}
function derivePriorities(report){
 const priorities=[],push=(priority,source,title,evidence,details)=>priorities.push({
  priority,source,title,evidence,details});
 for(const link of report.sections.links.report.links){
  if(link.classification==='broken')push('high','Links','Fix confirmed broken internal destination',
   link.destination+' · HTTP '+link.status,link.referringPages.slice(0,3).join(', '));
  if(link.classification==='server_error')push('high','Links','Investigate observed HTTP 5xx destination',
   link.destination+' · HTTP '+link.status,link.referringPages.slice(0,3).join(', '));
 }
 for(const finding of report.sections.seo.findings){
  if(finding.severity==='high')push('review','SEO',finding.label,
   finding.affectedPages[0]||'unknown page',finding.affectedPages.length+' affected page(s)');
 }
 for(const finding of report.sections.qa.findings){
  if(finding.severity==='high')push('review','QA',finding.label,
   finding.affectedPages[0]||'unknown page',finding.affectedPages.length+' affected page(s)');
 }
 for(const issue of report.sections.responsive.report.signals){
  if(issue.code==='document_horizontal_overflow')
   push('review','Responsive','Review measured horizontal document overflow',
    issue.url+' · '+issue.width+'px',issue.summary);
 }
 for(const sample of report.sections.security.report.pages){
  for(const issue of sample.checks||[]){
   if(issue.state==='review'&&['hsts','csp','nosniff'].includes(issue.code))
    push('review','Security','Review '+issue.label,sample.url,issue.detail);
  }
 }
 const order={high:0,review:1};
 priorities.sort((a,b)=>(order[a.priority]??2)-(order[b.priority]??2)||
  a.source.localeCompare(b.source)||a.evidence.localeCompare(b.evidence));
 return priorities.slice(0,25);
}
