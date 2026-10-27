// Pure audit lifecycle helpers, reusable by browser UI and deterministic stress tests.
export function reusablePages(checkpoint, origin, pages) {
 if(!checkpoint || JSON.stringify(checkpoint.pages)!==JSON.stringify(pages))return new Map();
 const allowed=new Set(pages), cached=new Map();
 for(const report of checkpoint.reports||[]){
  if(!report||report.auditStatus!=='complete'||report.partial||!Number.isFinite(report.score))continue;
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
