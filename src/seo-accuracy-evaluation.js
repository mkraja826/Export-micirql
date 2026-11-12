// Evidence-backed SEO detection evaluation. This is a benchmark utility,
// not a new SEO scoring methodology and not a claim of live-site accuracy.
export const SEO_GROUND_TRUTH_VERSION='micirql-seo-ground-truth-v1';
const validEvidence=new Set(['independent-http','independent-html','independent-link']);
const supportedExpected=new Set(['present','absent','unknown']);
const isString=value=>typeof value==='string'&&value.trim().length>0;
const urlKey=value=>{
 try{
  const u=new URL(value);
  if(u.protocol!=='http:'&&u.protocol!=='https:'||u.username||u.password)return null;
  u.hash='';
  return u.href;
 }catch{return null}
};
const publicPage=p=>(p?.pageRole||'public')==='public';
const pageInspected=p=>publicPage(p)&&p?.auditStatus==='complete'&&p.partial!==true;
const verifiedHttpError=p=>publicPage(p)&&p?.auditStatus==='invalid_http_status'&&p.httpVerification?.verified===true&&
 Number.isInteger(p.httpVerification.status)&&p.httpVerification.status>=400;
const isHttpCode=code=>/^http_/.test(code);
const metric=(n,d)=>d?n/d:null;
const detectionFor=(audit)=>{
 const issueKeys=new Set();
 for(const issue of audit.issueCenter){
  if(!isString(issue?.code))continue;
  for(const raw of issue.affectedUrls||[]){
   const k=urlKey(raw);
   if(k)issueKeys.add(k+'|'+issue.code);
  }
 }
 return issueKeys;
};
function evaluateOne(audit,groundTruth){
 if(!audit||!isString(audit.website)||!Array.isArray(audit.issueCenter)||!Array.isArray(audit.reports))
  throw Error('Audit must contain website, issueCenter[] and reports[]');
 if(groundTruth?.schemaVersion!==SEO_GROUND_TRUTH_VERSION||!Array.isArray(groundTruth.labels)||
  !isString(groundTruth.website)||!isString(groundTruth.reviewer))
  throw Error('Ground truth needs schemaVersion, website, reviewer and labels[]');
 const site=urlKey(audit.website),truthSite=urlKey(groundTruth.website);
 if(!site||!truthSite||new URL(site).origin!==new URL(truthSite).origin)
  throw Error('Audit and ground truth must belong to the same website origin');
 const origin=new URL(site).origin;
 const pages=new Map();
 for(const page of audit.reports){
  for(const raw of [page?.requestedUrl,page?.url]){
   const key=urlKey(raw);
   if(!key||new URL(key).origin!==origin)continue;
   const older=pages.get(key);
   if(!older||(pageInspected(page)&&!pageInspected(older))||
    (verifiedHttpError(page)&&!pageInspected(older)&&!verifiedHttpError(older)))pages.set(key,page);
  }
 }
 const found=detectionFor(audit);
 // Time-sensitive evidence must be collected near the snapshot it evaluates.
 // When timing cannot be established we abstain, rather than inflate precision.
 const auditTime=typeof audit.generatedAt==='string'&&/(Z|[+-]\\d\\d:\\d\\d)$/i.test(audit.generatedAt)&&
  Number.isFinite(Date.parse(audit.generatedAt))?Date.parse(audit.generatedAt):null;
 const windowMs=24*60*60*1000;
 const seen=new Set(),rows=[];
 for(const label of groundTruth.labels){
  const key=urlKey(label?.url);
  if(!key||new URL(key).origin!==origin||!isString(label?.code)||
   !supportedExpected.has(label.expected))
   throw Error('Ground truth contains malformed or cross-origin URL/code/expected');
  const id=key+'|'+label.code;
  if(seen.has(id))throw Error('Duplicate ground truth URL and issue code: '+id);
  seen.add(id);
  const evidence=label.evidence;
  if(label.expected!=='unknown'&&(!validEvidence.has(evidence?.type)||
    !isString(evidence?.detail)||!isString(evidence?.observedAt)||
    !Number.isFinite(Date.parse(evidence.observedAt))))
   throw Error('Independent, timestamped URL-level evidence required for '+id);
  const page=pages.get(key);
  const eligible=pageInspected(page)||(isHttpCode(label.code)&&verifiedHttpError(page));
  const observedTime=typeof evidence?.observedAt==='string'&&
   /(Z|[+-]\\d\\d:\\d\\d)$/i.test(evidence.observedAt)?Date.parse(evidence.observedAt):NaN;
  const status=label.expected==='unknown'?'unknown_ground_truth':
   !eligible?'not_inspected':
   auditTime===null?'audit_time_missing':
   !Number.isFinite(observedTime)||Math.abs(observedTime-auditTime)>windowMs?'stale_evidence':
   'evaluated';
  rows.push({url:key,code:label.code,expected:label.expected,
   detected:found.has(id),status,evidenceType:evidence?.type||null});
 }
 return {website:origin,rows};
}
export function evaluateSeoDetectionAccuracy(pairs){
 if(!Array.isArray(pairs)||!pairs.length)throw Error('Provide at least one audit and ground-truth pair');
 const results=pairs.map(p=>evaluateOne(p.audit,p.groundTruth));
 const rows=results.flatMap(item=>item.rows.map(r=>({...r,website:item.website})));
 const distinct=new Set();
 for(const row of rows){
  const key=row.website+'|'+row.url+'|'+row.code;
  if(distinct.has(key))throw Error('Duplicate cross-dataset URL and issue label: '+key);
  distinct.add(key);
 }
 const eligible=rows.filter(r=>r.status==='evaluated');
 const count={tp:0,fp:0,tn:0,fn:0};
 for(const row of eligible){
  if(row.expected==='present'&&row.detected)count.tp++;
  else if(row.expected==='present')count.fn++;
  else if(row.detected)count.fp++;
  else count.tn++;
 }
 const positives=count.tp+count.fn,negatives=count.fp+count.tn;
 const precision=metric(count.tp,count.tp+count.fp);
 const recall=metric(count.tp,positives);
 const falsePositiveRate=metric(count.fp,negatives);
 const specificity=metric(count.tn,negatives);
 const perSite=new Map(),byCode=new Map();
 for(const row of eligible){
  perSite.set(row.website,(perSite.get(row.website)||0)+1);
  const stats=byCode.get(row.code)||{labels:0,websites:new Set(),present:0,absent:0};
  stats.labels++;
  stats.websites.add(row.website);
  stats[row.expected]++;
  byCode.set(row.code,stats);
 }
 const sites=perSite.size;
 // Prevent a one-rule or single-site benchmark from passing as broad SEO accuracy.
 // These are proposed sampling screens, NOT independent certification of labels.
 const issueCodeCount=byCode.size;
 const crossSiteIssueCodes=[...byCode.values()].filter(s=>s.websites.size>=2).length;
 const twoSidedIssueCodes=[...byCode.values()].filter(s=>s.present>0&&s.absent>0).length;
 const dominantIssueCodeShare=eligible.length?
  Math.max(...[...byCode.values()].map(s=>s.labels))/eligible.length:null;
 const diversityThresholdMet=issueCodeCount>=5&&crossSiteIssueCodes>=5&&
  twoSidedIssueCodes>=3&&dominantIssueCodeShare<=0.4;
 const sampleThresholdMet=eligible.length>=100&&positives>=30&&negatives>=30&&
  sites>=5&&[...perSite.values()].every(count=>count>=10)&&
  (rows.length-eligible.length)<=Math.floor(rows.length*0.1)&&diversityThresholdMet;
 const meetsTargets=sampleThresholdMet&&precision!==null&&recall!==null&&
  precision>=0.95&&recall>=0.95;
 return {version:'micirql-detection-benchmark-v1',source:'independently-reviewed URL-level evidence',
  claims:'Benchmark results apply only to reviewed URLs and labeled issue codes, not full Google rankings or a Semrush-equivalent health score. URL evidence must be dated within 24 hours of the MiCirql audit.',
  totalLabels:rows.length,eligibleLabels:eligible.length,
  abstained:rows.length-eligible.length,abstainReasons:{
   notInspected:rows.filter(r=>r.status==='not_inspected').length,
   unknownTruth:rows.filter(r=>r.status==='unknown_ground_truth').length,
   auditTimeMissing:rows.filter(r=>r.status==='audit_time_missing').length,
   staleEvidence:rows.filter(r=>r.status==='stale_evidence').length
  },sites,positives,negatives,confusion:count,
  evidenceWindowHours:24,
  issueCodeCoverage:{issueCodeCount,crossSiteIssueCodes,twoSidedIssueCodes,
   dominantIssueCodeShare,diversityThresholdMet,
   requirements:'At least 5 issue codes observed on 2+ websites each, 3 codes with positive and negative labels, and no code above 40% of eligible labels'},
  precision,recall,falsePositiveRate,specificity,
  sampleThresholdMet, targetMet:meetsTargets,
  // Human verification of provenance, sampling and independent labels is mandatory.
  // Passing metrics from self-supplied JSON cannot certify real-world accuracy.
  readyForReleaseClaim:false,
  independentReviewSignoffRequired:true,
  verdict:!sampleThresholdMet?'insufficient_independent_evidence':
   meetsTargets?'proposed_target_met_for_submitted_labels':'proposed_target_not_met',
  publicationWarning:'This evaluator cannot authenticate manual evidence or sampling independence. Human review is required before public accuracy claims.',
  examples:rows.filter(r=>r.status==='evaluated'&&
   ((r.expected==='present')!==r.detected)).slice(0,25).map(r=>({
    website:r.website,url:r.url,code:r.code,expected:r.expected,detected:r.detected
   }))
 };
}
