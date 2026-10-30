// Pure audit lifecycle helpers, reusable by browser UI and deterministic stress tests.
import {SEO_SCORING_VERSION} from './inspector.js';
export function reusablePages(checkpoint, origin, pages) {
 if(!checkpoint || JSON.stringify(checkpoint.pages)!==JSON.stringify(pages))return new Map();
 const allowed=new Set(pages), cached=new Map();
 for(const report of checkpoint.reports||[]){
  if(!report||report.auditStatus!=='complete'||report.partial||!Number.isFinite(report.score)||report.scoringVersion!==SEO_SCORING_VERSION)continue;
  const requested=report.requestedUrl||report.url;
  if(!allowed.has(requested))continue;
  try{if(new URL(report.url).origin!==origin)continue}catch{continue}
  cached.set(requested,report);
 }
 return cached;
}
export function auditCoverage(pages,reports,failures){
 const selected=pages.length,analyzed=reports.length,failed=failures.length;
 if(selected<1||selected>60)throw Error('Audit selection must contain 1–60 pages');
 if(analyzed+failed!==selected)throw Error('Audit results do not account for every selected page');
 const complete=reports.filter(r=>r.auditStatus==='complete'&&!r.partial&&Number.isFinite(r.score)).length;
 return {selected,analyzed,failed,complete,partial:analyzed-complete,successfulPercent:Math.round(analyzed/selected*100),uniqueFinalPages:uniqueFinalPages(reports).length};
}
export async function inspectBatch({pages,checkpoint,origin,inspect,onProgress=()=>{},maxAttempts=2}){
 if(pages.length<1||pages.length>60||new Set(pages).size!==pages.length)throw Error('Invalid batch selection');
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>2)throw Error('Retry limit must be 1 or 2');
 for(const page of pages){try{const parsed=new URL(page);if(!['https:','http:'].includes(parsed.protocol)||parsed.origin!==origin||parsed.username||parsed.password)throw Error()}catch{throw Error('Batch contains an invalid or cross-origin URL')}}
 const cached=reusablePages(checkpoint,origin,pages),reports=[],failures=[];
 for(let i=0;i<pages.length;i++){
  const url=pages[i];
  if(cached.has(url)){reports.push(cached.get(url));onProgress({done:i+1,total:pages.length,resumed:true,url});continue}
  let lastError;let partialReport=null;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   try{const report=await inspect(url,attempt);if(!report)throw Error('Empty inspection');
    if((report.partial||report.auditStatus==='partial')&&attempt<maxAttempts){partialReport={...report,requestedUrl:url,attempts:attempt};lastError=Error('Incomplete HTML capture');continue;}
    reports.push({...report,requestedUrl:url,attempts:attempt});lastError=null;break;
   }catch(error){lastError=error}
  }
  if(lastError&&partialReport){reports.push({...partialReport,attempts:maxAttempts});lastError=null;}
  if(lastError)failures.push({url,error:lastError.message||String(lastError),attempts:maxAttempts});
  onProgress({done:i+1,total:pages.length,resumed:false,url});
 }
 return {reports,failures,coverage:auditCoverage(pages,reports,failures)};
}

/** Distinct final HTML documents, while retaining every requested URL as an audit attempt.
 * Strip fragments (not queries or trailing slashes) to avoid merging distinct resources.
 * Only completed inspections with known final URLs participate in cross-page comparisons.
 */
export function uniqueFinalPages(reports){
 const results=new Map();
 for(const report of reports||[]){
  if(!report||report.auditStatus!=='complete'||report.partial||!report.url)continue;
  let key;
  try{const url=new URL(report.url);if(!['http:','https:'].includes(url.protocol))continue;url.hash='';key=url.href}
  catch{continue}
  const previous=results.get(key);
  if(!previous||Number.isFinite(report.score)&&!Number.isFinite(previous.score))results.set(key,report);
 }
 return [...results.values()];
}

/** Browser response evidence coverage: HTML success never implies HTTP verification. */
export function httpEvidenceCoverage(reports=[]){
 const analyzed=reports.length;
 const observed=reports.filter(r=>r?.captureEvidence?.httpEvidence?.observed===true&&Number.isInteger(r.captureEvidence.httpEvidence.status)).length;
 const reasons={apiUnavailable:0,noResponseEvent:0,unknown:0};
 for(const report of reports){const evidence=report?.captureEvidence?.httpEvidence;if(evidence?.observed===true&&Number.isInteger(evidence.status))continue;
  if(evidence?.observationState==='api_unavailable')reasons.apiUnavailable++;else if(evidence?.observationState==='no_response_event')reasons.noResponseEvent++;else reasons.unknown++;
 }
 return {analyzed,observed,unverified:analyzed-observed,percent:analyzed?Math.round(observed/analyzed*100):0,reasons};
}

// Cross-page comparisons are advisory evidence for the PDF, never deductions
// against the per-page score. Only compare complete, public, potentially
// indexable final HTML pages and avoid penalizing intentional canonical copies.
export function crossPageMetadataFindings(reports=[]){
 const publicPages=uniqueFinalPages(reports).filter(report=>
  (report.pageRole||'public')==='public'&&Number.isFinite(report.score)&&
  !(report.findings||[]).some(item=>item.code==='noindex'||item.code==='http_noindex')
 );
 const normalizeCanonical=(value,base)=>{
  try{const c=new URL(value,base);if(!['http:','https:'].includes(c.protocol))return null;c.hash='';c.pathname=c.pathname.replace(/\/+$/,'')||'/';return c.href}catch{return null}
 };
 const indexable=publicPages.filter(report=>{
  if(!report.canonical?.trim())return true;
  return normalizeCanonical(report.canonical,report.url)===normalizeCanonical(report.url,report.url);
 });
 const findings=[];
 for(const [field,code,label,scope] of [
  ['title','duplicate_title','page title',indexable],
  ['description','duplicate_description','meta description',indexable],
  ['canonical','duplicate_canonical','canonical target',publicPages]
 ]){
  const groups=new Map();
  for(const report of scope){
   if(!report[field]?.trim())continue;
   const key=field==='canonical'?normalizeCanonical(report[field],report.url):report[field].trim().replace(/\s+/g,' ').toLocaleLowerCase();
   if(!key)continue;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(report.url);
  }
  for(const urls of groups.values()){
   if(urls.length<2)continue;
   const isCanonical=field==='canonical';
   findings.push({code,severity:isCanonical?'info':'medium',category:isCanonical?'indexability':'metadata',
    message:isCanonical?'Shared canonical target found on '+urls.length+' inspected public pages. This can be intentional for near-duplicate content; review rather than assuming an error.':'Same '+label+' found on '+urls.length+' independently indexable public pages. Review whether these pages have distinct search intent.',
    affectedUrls:urls});
  }
 }
 return findings;
}


/** Bounded cross-page diagnostics. Only evidence from completed, public pages is used.
 * These findings never change individual HTML scores.
 */
export function crossPageContentAndStructureFindings(reports=[],origin=''){
 const pages=uniqueFinalPages(reports).filter(r=>(r.pageRole||'public')==='public'&&Number.isFinite(r.score)&&!(r.findings||[]).some(f=>['noindex','http_noindex'].includes(f.code)));
 const findings=[],groups=new Map();
 for(const page of pages){
  const text=String(page.mainContentText||'').trim().toLowerCase().replace(/\s+/g,' ');
  // Exact match is defensible; hashes or similarity guesses are not proof.
  if(text.split(/\s+/).length<40)continue;
  if(!groups.has(text))groups.set(text,[]);
  groups.get(text).push(page.url);
 }
 for(const urls of groups.values())if(urls.length>=2)findings.push({code:'duplicate_page_content',severity:'medium',category:'content',message:'Identical substantive page text was observed on '+urls.length+' separately inspected pages; confirm whether this duplication is intentional.',affectedUrls:urls});
 // Click depth uses only discovered internal links, not URL path segments.
 const graph=new Map(pages.map(p=>[p.url,new Set((p.internalLinkTargets||[]).map(u=>{try{const x=new URL(u);x.hash='';return x.href}catch{return ''}}))]));
 let root=origin;
 try{root=new URL('/',origin).href}catch{}
 if(!graph.has(root))return findings;
 const distance=new Map([[root,0]]),queue=[root];
 for(let i=0;i<queue.length;i++){
  const from=queue[i],depth=distance.get(from);
  for(const to of graph.get(from)||[]){
   if(!graph.has(to)||distance.has(to))continue;
   distance.set(to,depth+1);queue.push(to);
  }
 }
 const deep=pages.filter(p=>(distance.get(p.url)??0)>3).map(p=>p.url);
 if(deep.length)findings.push({code:'deep_click_path',severity:'info',category:'structure',message:deep.length+' inspected pages require more than three internal-link clicks from the audited homepage. This is a navigation review, not a search ranking penalty.',affectedUrls:deep});
 const unreachable=pages.filter(p=>p.url!==root&&!distance.has(p.url)).map(p=>p.url);
 if(unreachable.length)findings.push({code:'unreachable_in_sample',severity:'info',category:'structure',message:unreachable.length+' inspected pages were not connected to the homepage by links recorded in this audit sample; hidden navigation or partial discovery may explain this.',affectedUrls:unreachable});
 return findings;
}
