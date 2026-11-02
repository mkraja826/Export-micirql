// Site-health transparency v1. This is NOT a newly calibrated numeric SEO score.
// Preserve individual inspector deductions and the separate eligible-page mean.
export const SITE_HEALTH_PRESENTATION_VERSION='micirql-site-health-v1';

const normalizedUrl=value=>{
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'&&url.protocol!=='http:')return String(value||'');
  url.hash='';url.pathname=url.pathname.replace(/\/+$/,'')||'/';
  return url.href;
 }catch{return String(value||'')}
};
const isComplete=page=>page&&page.auditStatus==='complete'&&page.partial!==true;
const confidenceTier=page=>isComplete(page)&&Number.isFinite(page.score)?3:page?.partial||page?.auditStatus==='partial'?2:1;

export function summarizeSeoSiteHealth(report){
 const source=Array.isArray(report?.reports)?report.reports:[];
 const selected=Number.isInteger(report?.pagesSelected)&&report.pagesSelected>=0?report.pagesSelected:source.length;
 const deduped=new Map();
 for(const page of source){
  if(!page||typeof page.url!=='string')continue;
  const key=normalizedUrl(page.requestedUrl||page.url);
  const current=deduped.get(key);
  if(!current||confidenceTier(page)>confidenceTier(current))deduped.set(key,page);
 }
 const inspected=[...deduped.values()];
 const completed=inspected.filter(isComplete);
 const scored=completed.filter(page=>(page.pageRole||'public')==='public'&&Number.isFinite(page.score));
 const averagePublicHtmlScore=scored.length?Math.round(scored.reduce((sum,page)=>sum+page.score,0)/scored.length):null;
 const issues=Array.isArray(report?.issueCenter)?report.issueCenter:[];
 const counts={high:0,medium:0,low:0,info:0};
 for(const issue of issues)if(issue&&Object.hasOwn(counts,issue.severity))counts[issue.severity]++;
 const partial=inspected.filter(page=>page.partial===true||page.auditStatus==='partial').length;
 const failedUrls=new Set((Array.isArray(report?.failures)?report.failures:[]).map(item=>normalizedUrl(item?.url)).filter(Boolean));
 const failed=failedUrls.size;
 const completedSelected=Math.min(selected,completed.length);
 const discoveryLimited=report?.coverage?.discoveryTruncated===true||report?.coverage?.selectionLimited===true;
 const scopeIncomplete=selected===0||failed>0||partial>0||completedSelected<selected||discoveryLimited;
 const coverage={
  selected,completed:completedSelected,partial,failed,discoveryLimited,
  inspectedUniqueUrls:inspected.length,
  selectedCompletePercent:selected?Math.round(completedSelected/selected*100):0,
  status:scopeIncomplete?'incomplete':'selected_pages_checked',
  limitation:'Inspected and selected pages are not evidence of complete website discovery.'
 };
 let status,interpretation;
 if(counts.high){
  status='Needs attention';
  interpretation=counts.high+' high-severity issue group(s) were detected in the audited sample. Some findings may be intentional; verify page purpose before changing indexability or canonicals.';
 }else if(scopeIncomplete){
  status='Audit incomplete';
  interpretation='Selected pages were not all fully verified or discovery was limited. Unchecked pages could contain important SEO problems.';
 }else if(counts.medium){
  status='Review needed';
  interpretation=counts.medium+' medium-severity issue group(s) need review on inspected pages.';
 }else if(averagePublicHtmlScore===null){
  status='Not assessed';
  interpretation='No eligible complete public-page HTML scores are available.';
 }else{
  status='No high-priority signals detected';
  interpretation='No high- or medium-severity issue groups were detected on the inspected pages. This is not a claim of excellent overall SEO health.';
 }
 const coverageSummary=completedSelected+'/'+selected+' selected pages completely inspected; '+failed+' failed and '+partial+' partial unique inspections.'+
  (discoveryLimited?' Discovery or selection limits mean additional website pages may exist.':'');
 return {
  version:SITE_HEALTH_PRESENTATION_VERSION,
  overallAssessment:status,interpretation,highSeverityGroups:counts.high,issueGroupsBySeverity:counts,
  averagePublicHtmlScore,eligiblePublicPages:scored.length,coverage,coverageSummary,
  scoreLabel:'Average complete public-page HTML score (not a full website SEO rating)',
  scoreScopeNote:'The HTML average does not include cross-page penalties, full crawl coverage, search rankings or traffic.',
  confidenceNote:scopeIncomplete?'Audit coverage incomplete. Findings from unvisited or failed pages are unknown.':
   'All selected pages have complete inspection records; undiscovered pages may still exist.',
  // Site risk and page score are deliberately separate until benchmark calibration.
  numericSiteHealthScore:null
 };
}
