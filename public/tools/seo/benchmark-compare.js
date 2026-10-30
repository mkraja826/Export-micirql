// Compare MiCirql site audits without treating incomplete captures as repaired findings.
const uniqueFinal=reports=>new Set((reports||[]).filter(r=>r?.auditStatus==='complete'&&!r.partial&&r.url).map(r=>{try{const u=new URL(r.url);u.hash='';return u.href}catch{return null}}).filter(Boolean)).size;
const complete=page=>page?.auditStatus==='complete'&&!page.partial&&typeof(page.requestedUrl||page.url)==='string';
const completedPages=audit=>new Map((audit.reports||[]).filter(complete).map(page=>[page.requestedUrl||page.url,page]));
const sorted=values=>[...values].sort();
const selected=audit=>Array.isArray(audit.selectedPageUrls)?new Set(audit.selectedPageUrls):new Set((audit.reports||[]).map(page=>page.requestedUrl||page.url).filter(Boolean));
const signatures=(audit,comparable,includeSite)=>{
 const seen=new Set();
 for(const page of audit.reports||[]){
  const url=page.requestedUrl||page.url;
  if(!complete(page)||!comparable.has(url))continue;
  for(const finding of page.findings||[])if(finding.code)seen.add('page:'+url+'|'+finding.code);
 }
 if(includeSite)for(const finding of audit.siteFindings||[]){
  if(!finding.code)continue;
  for(const url of new Set(finding.affectedUrls||[]))if(comparable.has(url))seen.add('site:'+url+'|'+finding.code);
 }
 return seen;
};
export function compareSeoAudits(before,after){
 if(!before||!after||!Array.isArray(before.reports)||!Array.isArray(after.reports))throw Error('Both audits need reports arrays');
 const beforeHost=new URL(before.website).origin,afterHost=new URL(after.website).origin;
 const beforeVersion=typeof before.scoringVersion==='string'?before.scoringVersion:null,afterVersion=typeof after.scoringVersion==='string'?after.scoringVersion:null;
 const versionsMatch=Boolean(beforeVersion&&afterVersion&&beforeVersion===afterVersion);
 if(beforeHost!==afterHost)throw Error('Audits must cover the same website origin');
 const oldSelected=selected(before),newSelected=selected(after);
 const comparableSelection=Array.isArray(before.selectedPageUrls)&&Array.isArray(after.selectedPageUrls)&&oldSelected.size===newSelected.size&&[...oldSelected].every(url=>newSelected.has(url));
 const oldPages=completedPages(before),newPages=completedPages(after);
 const comparable=sorted([...oldPages.keys()].filter(url=>newPages.has(url)));
 const comparableSet=new Set(comparable);
 const allSelectedComplete=comparableSelection&&oldPages.size===oldSelected.size&&newPages.size===newSelected.size&&comparable.length===oldSelected.size;
 // Cross-page findings depend on the full selected set, so exclude them when coverage differs.
 const oldFindings=versionsMatch?signatures(before,comparableSet,allSelectedComplete):new Set(),newFindings=versionsMatch?signatures(after,comparableSet,allSelectedComplete):new Set();
 const newlyReported=sorted([...newFindings].filter(key=>!oldFindings.has(key)));
 const noLongerReported=sorted([...oldFindings].filter(key=>!newFindings.has(key)));
 const remainingReported=sorted([...newFindings].filter(key=>oldFindings.has(key)));
 const notComparedPages=sorted(new Set([...oldSelected,...newSelected].filter(url=>!versionsMatch||!comparableSet.has(url))));
 const publicPairs=comparable.filter(url=>oldPages.get(url)?.pageRole==='public'&&newPages.get(url)?.pageRole==='public');
 const scoreComparable=versionsMatch&&allSelectedComplete&&publicPairs.length>0&&publicPairs.every(url=>Number.isFinite(oldPages.get(url).score)&&Number.isFinite(newPages.get(url).score))&&comparable.every(url=>oldPages.get(url)?.pageRole===newPages.get(url)?.pageRole);
 const average=(pages,urls)=>Math.round(urls.reduce((sum,url)=>sum+pages.get(url).score,0)/urls.length);
 const beforeScore=scoreComparable?average(oldPages,publicPairs):null,afterScore=scoreComparable?average(newPages,publicPairs):null;
 const priority={high:0,medium:1,low:2,info:3};
 const unresolved=new Set([...newlyReported,...remainingReported]);
 const candidates=[];
 for(const url of comparable)for(const finding of newPages.get(url).findings||[]){
  const key='page:'+url+'|'+finding.code;
  if(finding.code&&unresolved.has(key))candidates.push({code:finding.code,url,severity:finding.severity||'info',status:oldFindings.has(key)?'remaining':'new'});
 }
 if(versionsMatch&&allSelectedComplete)for(const finding of after.siteFindings||[])for(const url of finding.affectedUrls||[]){
  const key='site:'+url+'|'+finding.code;
  if(finding.code&&unresolved.has(key))candidates.push({code:finding.code,url,severity:finding.severity||'info',status:oldFindings.has(key)?'remaining':'new'});
 }
 candidates.sort((a,b)=>(priority[a.severity]??4)-(priority[b.severity]??4)||a.url.localeCompare(b.url)||a.code.localeCompare(b.code));
 const http=audit=>(audit.reports||[]).filter(r=>r.captureEvidence?.httpEvidence?.observed===true).length;
 return {
  website:beforeHost,
  before:{inspections:before.reports.length,uniqueFinalPages:uniqueFinal(before.reports),httpObserved:http(before),failures:(before.failures||[]).length,findings:oldFindings.size},
  after:{inspections:after.reports.length,uniqueFinalPages:uniqueFinal(after.reports),httpObserved:http(after),failures:(after.failures||[]).length,findings:newFindings.size},
  scoringVersions:{before:beforeVersion,after:afterVersion,compatible:versionsMatch},findingsComparable:versionsMatch,
  comparableSelection,comparablePages:versionsMatch?comparable:[],notComparedPages,
  newlyReported,noLongerReported,remainingReported,
  scoreComparison:scoreComparable?{before:beforeScore,after:afterScore,change:afterScore-beforeScore,publicPages:publicPairs.length}:null,
  nextCheck:candidates[0]||null,
  caution:!versionsMatch?'Scoring rules differ or the older report has no recorded scoring version. Score changes and finding resolutions are not comparable; this does not prove an SEO improvement.':allSelectedComplete?'Both audits completed the same selected pages under the same scoring rules. Changes describe HTML findings, not rankings or traffic.':'Only pages with complete audits in both files are compared. Changed selections, incomplete captures or failures cannot confirm that issues were fixed. Cross-page findings and score changes are excluded when coverage differs.'
 };
}
