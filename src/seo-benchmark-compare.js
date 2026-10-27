// Compare saved MiCirql site-audit JSON snapshots without pretending scores imply detection accuracy.
const uniqueFinal=reports=>new Set((reports||[]).filter(r=>r?.auditStatus==='complete'&&!r.partial&&r.url).map(r=>{try{const u=new URL(r.url);u.hash='';return u.href}catch{return null}}).filter(Boolean)).size;
const signatures=audit=>{
 const set=new Set();
 for(const page of audit.reports||[]){
  const url=page.requestedUrl||page.url;
  if(!url)continue;
  for(const finding of page.findings||[])if(finding.code)set.add('page:'+url+'|'+finding.code);
 }
 for(const finding of audit.siteFindings||[]){
  if(!finding.code)continue;
  for(const url of new Set(finding.affectedUrls||[]))set.add('site:'+url+'|'+finding.code);
 }
 return set;
};
export function compareSeoAudits(before,after){
 if(!before||!after||!Array.isArray(before.reports)||!Array.isArray(after.reports))throw Error('Both audits need reports arrays');
 const beforeHost=new URL(before.website).origin,afterHost=new URL(after.website).origin;
 if(beforeHost!==afterHost)throw Error('Audits must cover the same website origin');
 const a=signatures(before),b=signatures(after);
 const sorted=x=>[...x].sort();
 const http=audit=>(audit.reports||[]).filter(r=>r.captureEvidence?.httpEvidence?.observed===true).length;
 return {
  website:beforeHost,
  before:{inspections:before.reports.length,uniqueFinalPages:uniqueFinal(before.reports),httpObserved: http(before),failures:(before.failures||[]).length,findings:a.size},
  after:{inspections:after.reports.length,uniqueFinalPages:uniqueFinal(after.reports),httpObserved:http(after),failures:(after.failures||[]).length,findings:b.size},
  newlyReported:sorted(new Set([...b].filter(x=>!a.has(x)))),
  noLongerReported:sorted(new Set([...a].filter(x=>!b.has(x)))),
  comparableSelection:JSON.stringify([...(before.selectedPageUrls||[])].sort())===JSON.stringify([...(after.selectedPageUrls||[])].sort())&&Array.isArray(before.selectedPageUrls)&&Array.isArray(after.selectedPageUrls),
  caution:'New or missing findings require ground-truth review; different page selections invalidate score comparisons.'
 };
}
