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
