// Interpret only captured main-frame HTTP evidence. Unknown signals are not passed checks.
export function interpretHttpEvidence(evidence, htmlCanonical='', pageUrl=''){
 const findings=[];
 if(!evidence?.observed||!Number.isInteger(evidence.status))return {verified:false,findings};
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
 return {verified:true,status,findings};
}
