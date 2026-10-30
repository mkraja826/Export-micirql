// Interpret only captured main-frame HTTP evidence. Unknown signals are not passed checks.
export function interpretHttpEvidence(evidence, htmlCanonical='', pageUrl=''){
 const findings=[];
 if(!evidence?.observed||!Number.isInteger(evidence.status))return {verified:false,findings};
 const hops=Array.isArray(evidence.redirects)?evidence.redirects.slice(0,20):[];
 // Redirect observation is bounded; do not claim an unseen hop or a detected loop.
 const chain=hops.map(h=>({url:String(h.url||''),status:h.status,location:h.location||null}));
 const redirectFindings=[];
 // A loop is confirmed only when observed Location edges reconnect to a prior
 // observed redirect source, not merely when a final URL repeats.
 const observedSources=new Set();
 let confirmedLoop=false;
 for(const hop of chain){
  let source,target;
  try{
   source=new URL(hop.url);source.hash='';
   target=new URL(hop.location,source);target.hash='';
  }catch{continue}
  observedSources.add(source.href);
  if(observedSources.has(target.href)&&chain.some(edge=>{
   try{const u=new URL(edge.url);u.hash='';return u.href===target.href}catch{return false}
  }))confirmedLoop=true;
 }
 if(confirmedLoop)redirectFindings.push({code:'http_redirect_loop',severity:'high',message:'Observed redirect locations form a cycle.',points:0,category:'http',evidenceConfidence:'verified',evidence:chain});
 if(chain.length>=3)redirectFindings.push({code:'http_redirect_chain',severity:'medium',message:chain.length+' HTTP redirect hops were observed.',points:0,category:'http',evidenceConfidence:'verified',evidence:chain});
 const status=evidence.status;
 const headers=evidence.headers||{};
 const add=(code,severity,message)=>findings.push({code,severity,message,points:0,category:'http',evidenceConfidence:'verified'});
 if(status===404||status===410)add('http_not_found','high','Server returned HTTP '+status+' for this page.');
 else if(status===429)add('http_rate_limited','medium','Server returned HTTP 429 (rate limited); retry later.');
 else if(status>=500)add('http_server_error','high','Server returned HTTP '+status+'.');
 const robots=String(headers['x-robots-tag']||'');
 if(/(?:^|[,\s])noindex(?:[,\s]|$)/i.test(robots))add('http_noindex','high','HTTP X-Robots-Tag requests noindex.');
 const link=String(headers.link||'');
 const match=link.match(/<([^>]+)>\s*;\s*rel\s*=\s*(?:"canonical"|'canonical'|canonical)(?:\s*;|\s*,|\s*$)/i);
 if(match&&htmlCanonical){
  try{
   const base=pageUrl||evidence.finalUrl||evidence.requestedUrl;
   const a=new URL(match[1],base);const b=new URL(htmlCanonical,base);a.hash='';b.hash='';
   if(a.href!==b.href)add('http_canonical_conflict','high','HTTP Link canonical disagrees with the HTML canonical.');
  }catch{/* Invalid URLs require separate canonical validation. */}
 }
 return {verified:true,status,redirects:chain,findings:[...findings,...redirectFindings]};
}

// Reconcile browser-confirmed HTTP facts with the HTML-only score. This is a
// read-only calculation; unobserved headers/status never become deductions.
export function reconcileHttpSeoScore(report,httpCheck){
 if(!report||!httpCheck?.verified||!Number.isInteger(httpCheck.status))return report;
 const status=httpCheck.status;
 // A soft error screen can be identified from its HTML even if the server sends 200.
 // Never turn that previously excluded screen into a perfect-scoring SEO page.
 if(report.auditStatus==='invalid_error_page'&&status<400)return report;
 const authRoute=report.pageRole==='application'&&/(?:^|\/)(?:login|signin|signup|register|registration|forgot-password|reset-password|password-reset)(?:\/|$)/.test(new URL(report.url).pathname.toLowerCase());
 if(authRoute){
  const intentional=report.findings.filter(item=>item.code==='http_noindex');
  if(intentional.length){
   report.contextualFindings=[...(report.contextualFindings||[]),...intentional.map(item=>({...item,reason:'Authentication page: HTTP noindex is an expected exclusion from public search.'}))];
   report.findings=report.findings.filter(item=>item.code!=='http_noindex');
  }
 }
 // A page returning an observed error code does not have a meaningful HTML
 // search-readiness score, even if its custom error template has good metadata.
 if(status>=400&&status<=599){
  report.score=null;
  report.scoreLabel='Not scored';
  report.auditStatus='invalid_http_status';
  report.scoreExplanation='Not scored: browser-confirmed HTTP '+status+' response. The HTML belongs to an error/unavailable response, not an indexable page assessment.';
  report.scoring={...(report.scoring||{}),appliedScore:null,excludedReason:'verified_http_'+status,coverage:'verified_http_error'};
  return report;
 }
 // HTTP noindex and HTML meta noindex carry the same indexability signal.
 // Preserve both findings, but never deduct twice for the same restriction.
 const hasHtmlNoindex=report.findings.some(item=>item.code==='noindex');
 for(const item of report.findings){
  if(item.code==='http_noindex')item.points=hasHtmlNoindex?0:25;
  else if(item.code==='http_canonical_conflict')item.points=12;
 }
 const deductions=report.findings.reduce((sum,item)=>sum+(item.points||0),0);
 const categoryDeductions={};
 for(const item of report.findings){const category=item.category||'technical';categoryDeductions[category]=(categoryDeductions[category]||0)+(item.points||0);}
 report.score=Math.max(0,100-deductions);
 report.scoring={...(report.scoring||{}),startingScore:100,totalDeductions:deductions,categoryDeductions,appliedScore:report.score,scoreFloor:0,method:'weighted_html_and_verified_http_deductions',coverage:report.partial?'partial_html_plus_verified_http':'html_plus_verified_http'};
 report.scoreExplanation='Heuristic HTML score with observed HTTP indexability signals. Not a Google ranking, performance, accessibility or full-site SEO score.';
 return report;
}
