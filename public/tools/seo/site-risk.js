// Independent website-risk evidence engine v1.
// No numeric site-health score until benchmark calibration.
export const SITE_RISK_VERSION='micirql-site-risk-v1';
const norm=value=>{
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol))return '';u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href}
 catch{return ''}
};
const complete=p=>p?.auditStatus==='complete'&&p.partial!==true;
const publicPage=p=>(p?.pageRole||'public')==='public';
const severityRank={high:3,medium:2,low:1,info:0};
const verifiedIssue=i=>i?.verified===true||i?.evidenceStatus==='verified'||i?.verificationStatus==='verified';
// Critical requires specific high-impact evidence, not merely a high issue count or URL share.
const CRITICAL_CODES=new Set([
 'http_noindex','http_robots_blocked','robots_blocked','sitewide_noindex',
 'unexpected_noindex','noindex','canonical_external','canonical_conflict',
 'multiple_canonicals','canonical_to_unreachable','indexable_page_404',
 'http_404','http_410','http_5xx','server_error'
]);
const criticalCode=code=>CRITICAL_CODES.has(String(code||'').toLowerCase());
const roleOf=url=>{
 let path='/';try{path=new URL(url).pathname.toLowerCase()}catch{}
 if(path==='/'||path==='/index.html')return 'home';
 if(/^\/(services?|products?|locations?|contact|about)(\/|$)/.test(path))return 'important';
 return 'standard';
};
export function assessSeoSiteRisk(report){
 const reports=Array.isArray(report?.reports)?report.reports:[];
 const pages=new Map();
 for(const page of reports){
  const url=norm(page?.requestedUrl||page?.url);if(!url)continue;
  const prior=pages.get(url);
  if(!prior||(complete(page)&&!complete(prior)))pages.set(url,page);
 }
 const eligible=[...pages.entries()].filter(([,p])=>complete(p)&&publicPage(p));
 const eligibleUrls=new Set(eligible.map(([u])=>u));
 const issues=Array.isArray(report?.issueCenter)?report.issueCenter:[];
 const grouped=new Map();
 for(const issue of issues){
  if(!issue||!(issue.severity in severityRank))continue;
  const code=String(issue.code||'unspecified').trim();
  const evidence=String(issue.evidenceStatus||issue.verificationStatus||'');
  const urls=[...new Set((Array.isArray(issue.affectedUrls)?issue.affectedUrls:[]).map(norm).filter(u=>u&&eligibleUrls.has(u)))];
  // Issue groups with unspecified affected URLs cannot establish public-site reach.
  if(!urls.length)continue;
  const key=code+'|'+issue.severity;
  const old=grouped.get(key);
  const record=old||{code,severity:issue.severity,urls:new Set(),verifiedUrls:new Set(),evidenceStatuses:new Set()};
  urls.forEach(u=>record.urls.add(u));
  const verifiedUrls=Array.isArray(issue.verifiedAffectedUrls)?issue.verifiedAffectedUrls.map(norm):verifiedIssue(issue)?urls:[];
  verifiedUrls.filter(u=>urls.includes(u)).forEach(u=>record.verifiedUrls.add(u));
  if(evidence)record.evidenceStatuses.add(evidence);
  grouped.set(key,record);
 }
 const findings=[...grouped.values()].map(item=>{
  const affectedUrls=[...item.urls].sort();
  const confirmedUrls=[...item.verifiedUrls].sort();
  const important=confirmedUrls.some(u=>roleOf(u)!=='standard');
  const affectedPercent=eligibleUrls.size?Math.round(100*affectedUrls.length/eligibleUrls.size):0;
  return {code:item.code,severity:item.severity,verified:confirmedUrls.length>0,
   evidenceStatus:confirmedUrls.length?'verified':'not_verified',
   affectedPages:affectedUrls.length,affectedPercent,verifiedAffectedPages:confirmedUrls.length,
   verifiedAffectedPercent:eligibleUrls.size?Math.round(100*confirmedUrls.length/eligibleUrls.size):0,
   importantPageAffected:important,criticalEligible:criticalCode(item.code),
   verifiedAffectedUrls:confirmedUrls,affectedUrls};
 }).sort((a,b)=>Number(b.verified)-Number(a.verified)||severityRank[b.severity]-severityRank[a.severity]||b.affectedPages-a.affectedPages||a.code.localeCompare(b.code));
 const selected=Number.isInteger(report?.pagesSelected)?report.pagesSelected:pages.size;
 const failures=Array.isArray(report?.failures)?report.failures:[];
 const coverage=report?.coverage||{};
 const incomplete=!eligibleUrls.size||[...pages.values()].some(p=>!complete(p))||
   failures.length>0||selected> [...pages.values()].filter(complete).length||
   coverage.discoveryTruncated===true||coverage.selectionLimited===true;
 const confirmedHigh=findings.filter(f=>f.severity==='high'&&f.verified);
 const unverifiedHigh=findings.filter(f=>f.severity==='high'&&!f.verified);
 let level='no_verified_high_risk';
 if(confirmedHigh.some(f=>f.criticalEligible&&(f.importantPageAffected||f.verifiedAffectedPercent>=50)))level='critical';
 else if(confirmedHigh.length)level='high';
 else if(findings.some(f=>f.verified&&f.severity==='medium'))level='moderate';
 if(!confirmedHigh.length&&incomplete)level='unverified';
 return {version:SITE_RISK_VERSION,level,numericScore:null,
  coverageComplete:!incomplete,eligiblePublicPages:eligibleUrls.size,
  verifiedHighGroups:confirmedHigh.length,unverifiedHighGroups:unverifiedHigh.length,
  findings,limitations:['Findings without eligible affected URLs cannot be assigned site-wide reach.',
   'Verification requires explicit evidence; issue severity alone is not HTTP confirmation.',
   'Selected-page coverage never proves complete website discovery.'],
  note:incomplete?'Coverage is incomplete; uninspected pages may contain additional risks.':
   'All selected pages were inspected; undiscovered pages may still exist.'};
}
