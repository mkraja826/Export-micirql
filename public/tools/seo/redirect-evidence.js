// Interpret observed main-frame redirects only; never infer hops from URL differences.
export function analyzeRedirectEvidence(evidence){
 const hops=Array.isArray(evidence?.redirects)?evidence.redirects.filter(h=>h&&Number.isInteger(h.status)&&h.status>=300&&h.status<400&&typeof h.url==='string').slice(0,30):[];
 if(!hops.length)return [];
 const sequence=[],seen=new Set(),findings=[];
 for(const hop of hops){
  let source,target;
  try{source=new URL(hop.url);target=hop.location?new URL(hop.location,source):null}catch{continue}
  if(!['http:','https:'].includes(source.protocol))continue;
  sequence.push({source:source.href,target:target?.href||null,status:hop.status});
  if(seen.has(source.href)){findings.push({code:'redirect_loop_observed',severity:'high',category:'technical',points:0,message:'Repeated URL observed in the main-frame redirect sequence. Review the redirect loop.',evidence:sequence.slice(0,10)});break}
  seen.add(source.href);
 }
 if(!findings.length&&sequence.length>=2)findings.push({code:'redirect_chain_observed',severity:'info',category:'technical',points:0,message:sequence.length+' redirect responses were observed before the final page. Review whether this chain is necessary.',evidence:sequence.slice(0,10)});
 return findings;
}
