// Deterministic URL/evidence handling for the read-only Link & Sitemap Inspector.
// Never infer a broken destination from failure to capture a page or from timeouts.
export const LINK_AUDIT_PAGE_LIMIT=60;
export const LINK_AUDIT_DESTINATION_LIMIT=60;
const stripFragment=value=>{try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.hash='';return u.href}catch{return null}};
export function normalizeLinkTarget(value,base){
 try{const u=new URL(value,base);return stripFragment(u.href)}catch{return null}
}
export function chooseAuditedPages(rawPages,origin,limit=LINK_AUDIT_PAGE_LIMIT){
 if(!Number.isInteger(limit)||limit<1||limit>LINK_AUDIT_PAGE_LIMIT)throw Error('Page selection limit must be 1–60');
 const site=new URL(origin),chosen=new Set();
 for(const raw of rawPages||[]){
  const url=normalizeLinkTarget(raw,site.href);
  if(url&&new URL(url).origin===site.origin)chosen.add(url);
  if(chosen.size>=limit)break;
 }
 return [...chosen];
}
export function buildLinkAudit({website,pages=[],diagnostics=[],discovered=0,discoveryTruncated=false,sitemap=null}){
 const root=new URL(website).origin;
 if(pages.length>LINK_AUDIT_PAGE_LIMIT)throw Error('Too many audited pages');
 const referrers=new Map(),pageStates=[];
 for(const page of pages){
  const url=normalizeLinkTarget(page?.url,root);
  if(!url||new URL(url).origin!==root)continue;
  const status=page?.complete===true?'complete':'unverified';
  pageStates.push({url,status,reason:status==='complete'?null:String(page?.reason||'capture_incomplete')});
  if(status!=='complete')continue;
  for(const raw of page.targets||[]){
   const target=normalizeLinkTarget(raw,url);
   if(!target||new URL(target).origin!==root)continue;
   if(!referrers.has(target))referrers.set(target,new Set());
   referrers.get(target).add(url);
  }
 }
 const targets=[...referrers.keys()].sort();
 const checked=new Map();
 for(const row of diagnostics){
  const destination=normalizeLinkTarget(row?.destination,root);
  if(!destination||new URL(destination).origin!==root||!referrers.has(destination))continue;
  const status=Number.isInteger(row?.status)?row.status:null;
  const classification=status===404||status===410?'broken':status>=500&&status<=599?'server_error':
   status>=200&&status<400?'reachable':'unverified';
  // A claimed status without successful evidence is not a verified HTTP response.
  const observed=row?.ok===true&&Number.isInteger(status)&&classification!=='unverified';
  checked.set(destination,{destination,status:observed?status:null,
   classification:observed?classification:'unverified',
   finalUrl:observed?normalizeLinkTarget(row.finalUrl||destination,destination):null,
   referringPages:[...referrers.get(destination)].sort(),
   reason:observed?null:String(row?.reason||'http_response_not_verified')});
 }
 const rows=targets.map(destination=>checked.get(destination)||{destination,status:null,classification:'not_checked',finalUrl:null,referringPages:[...referrers.get(destination)].sort(),reason:'limit_or_no_response'});
 const count=key=>rows.filter(r=>r.classification===key).length;
 const pageComplete=pageStates.filter(p=>p.status==='complete').length;
 const sitemapSummary=summarizeSitemapEvidence(sitemap,root);
 return {schemaVersion:1,tool:'links',website:root,generatedAt:new Date().toISOString(),
  scope:{selectedPages:pageStates.length,completePages:pageComplete,unverifiedPages:pageStates.length-pageComplete,
   discoveredPages:discovered||pageStates.length,discoveryTruncated:discoveryTruncated===true,
   uniqueInternalDestinations:targets.length,checkedDestinations:checked.size,
   destinationLimit:LINK_AUDIT_DESTINATION_LIMIT,destinationSelectionLimited:targets.length>checked.size},
  summary:{broken:count('broken'),serverErrors:count('server_error'),reachable:count('reachable'),
   unverified:count('unverified'),notChecked:count('not_checked')},
  sitemap:sitemapSummary,pages:pageStates,links:rows,
  limitation:'HTTP 404/410 is confirmed broken only when observed. A 5xx is a server error, and blocked/timed-out/unchecked destinations are inconclusive. Other public pages may exist.'};
}
export function summarizeSitemapEvidence(observation,origin){
 if(!observation?.observed||!Number.isInteger(observation.status))
  return {state:'unverified',status:null,urls:[],message:'Sitemap HTTP response was not verified'};
 const status=observation.status;
 if(status===404||status===410)return {state:'not_found',status,urls:[],message:'No sitemap.xml was found at the standard path; other sitemap locations may exist'};
 if(status<200||status>=300||observation.truncated||typeof observation.body!=='string')
  return {state:'unverified',status,urls:[],message:'Sitemap response or full XML body could not be verified'};
 const body=observation.body;
 if(body.length>500000)return {state:'unverified',status,urls:[],message:'Sitemap response exceeded inspection limit'};
 const xml=body.replace(/<\!\[CDATA\[([\s\S]*?)\]\]>/g,(_,v)=>v);
 const locs=[...xml.matchAll(/<loc(?:\s[^>]*)?>\s*([^<]+?)\s*<\/loc\s*>/gi)].map(m=>m[1].replace(/&amp;/gi,'&').trim());
 const urls=[...new Set(locs.map(value=>normalizeLinkTarget(value,origin)).filter(Boolean))];
 const external=urls.filter(url=>new URL(url).origin!==origin).length;
 return {state:locs.length?'checked':'needs_review',status,urls:urls.filter(url=>new URL(url).origin===origin).slice(0,500),
  listedCount:locs.length,externalCount:external,
  message:locs.length?'Sitemap locations parsed; this is not a full XML schema validation':'No sitemap <loc> elements observed; review sitemap format'};
}
