// Read-only QA: retry a small, bounded subset of clearly transient HTML capture errors.
// Never retry access restrictions, redirects, invalid URLs, or permanent HTTP failures.
export const QA_CAPTURE_RETRY_LIMIT=5;
export function isTransientQaCaptureError(reason){
 const text=String(reason||'');
 if(!text||/(?:\b(?:401|403|404|410|429)\b|forbidden|unauthori[sz]ed|access.denied|permission|blocked|redirect|different.origin|outside.the.selected.website|invalid.url|credentials|login.required|not.allowed|robots)/i.test(text))return false;
 return /(?:timed?\s*out|timeout|temporar(?:ily|y) unavailable|connection (?:reset|closed|interrupted|failed)|net::err_(?:timed_out|connection_reset|connection_closed|connection_refused|network_changed|internet_disconnected)|\b(?:ECONNRESET|ETIMEDOUT|ECONNREFUSED)\b)/i.test(text);
}
export function selectQaCaptureRetries(failures,limit=QA_CAPTURE_RETRY_LIMIT){
 const max=Math.min(QA_CAPTURE_RETRY_LIMIT,Math.max(0,Math.trunc(Number(limit)||0)));
 const seen=new Set(),results=[];
 if(max===0)return results;
 for(const failure of Array.isArray(failures)?failures:[]){
  if(!failure||typeof failure.url!=='string'||!isTransientQaCaptureError(failure.reason))continue;
  let parsed;
  try{parsed=new URL(failure.url)}catch{continue}
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||seen.has(parsed.href))continue;
  seen.add(parsed.href);
  results.push(failure);
  if(results.length>=max)break;
 }
 return results;
}
