// Keep crawl-discovery failures separate from HTML capture failures.
// This module NEVER turns unvisited pages into verified HTML or page-level findings.
const MAX_PAGES=60;
export function summarizeQaDiscovery(entryUrl,response,selectedPages=[]){
 let origin='';
 try{origin=new URL(entryUrl).origin}catch{}
 const pages=Array.isArray(selectedPages)?selectedPages.filter(v=>typeof v==='string').slice(0,MAX_PAGES):[];
 const successful=new Set(pages);
 const errors=[];
 const seen=new Set();
 for(const row of Array.isArray(response?.errors)?response.errors.slice(0,MAX_PAGES*3):[]){
  if(!row||typeof row.url!=='string')continue;
  let url;
  try{
   const target=new URL(row.url);
   if(!['http:','https:'].includes(target.protocol)||target.origin!==origin||target.username||target.password)continue;
   target.hash='';target.search='';url=target.href;
  }catch{continue}
  if(seen.has(url)||successful.has(url))continue;
  seen.add(url);
  errors.push({url,reason:String(row.message||row.reason||'Page discovery could not inspect this URL.').slice(0,240)});
  if(errors.length>=MAX_PAGES)break;
 }
 const scanned=Number.isInteger(response?.scanned)&&response.scanned>=0&&response.scanned<=MAX_PAGES
  ?response.scanned:null;
 const failed=errors.length;
 const selected=pages.length;
 const reportedUnaccounted=scanned===null?null:Math.max(0,scanned-selected-failed);
 const inconsistentCount=scanned!==null&&scanned<selected+failed;
 const truncated=response?.truncated===true;
 const discoveryFailed=response?.ok===false;
 const status=discoveryFailed||selected===0||failed>0||truncated||reportedUnaccounted>0||scanned===null||inconsistentCount?'incomplete':'completed';
 const error=discoveryFailed?String(response?.error||'Website discovery failed').slice(0,240):null;
 return {status,selected,scanned,failed,reportedUnaccounted,truncated,error,errors,
  scanCountAvailable:scanned!==null,inconsistentCount,
  limitation:'Only reachable, same-origin pages returned by Chrome are selected for HTML inspection; unvisited URLs have no QA findings.'};
}
