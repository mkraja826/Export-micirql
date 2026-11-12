// Convert human-adjudicated review drafts into evaluator input. This does not
// verify evidence, authenticate reviewers, or certify real-world SEO accuracy.
import {SEO_REVIEW_QUEUE_VERSION} from './seo-review-queue.js';
import {SEO_GROUND_TRUTH_VERSION} from './seo-accuracy-evaluation.js';

const decisions=new Set(['present','absent','unknown']);
const evidenceTypes=new Set(['independent-http','independent-html','independent-link']);
const nonblank=v=>typeof v==='string'&&v.trim().length>0;
const zonedTime=v=>typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/i.test(v)&&
 Number.isFinite(Date.parse(v))?Date.parse(v):null;
const urlKey=value=>{
 try{
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  u.hash='';
  return u.href;
 }catch{return null}
};

export function finalizeSeoReviewDraft(original,reviewed){
 if(original?.schemaVersion!==SEO_REVIEW_QUEUE_VERSION||original?.status!=='draft_unreviewed'||
  !Array.isArray(original?.labels)||!nonblank(original?.website)||
  !original.provenance||!Array.isArray(reviewed?.labels))
  throw Error('Original must be an unreviewed MiCirql review-queue draft');
 if(reviewed.schemaVersion!==original.schemaVersion||reviewed.website!==original.website||
  reviewed.labels.length!==original.labels.length)
  throw Error('Reviewed draft must retain original schema, website, and case count');
 if(!nonblank(reviewed.reviewer))
  throw Error('Reviewer identity must be supplied by the person verifying evidence');
 const website=urlKey(original.website),origin=website?new URL(website).origin:null;
 if(!origin)throw Error('Original website URL is invalid');
 const auditTime=zonedTime(original.provenance.sourceGeneratedAt);
 const seen=new Set(),labels=[];
 let reviewedCount=0;
 for(let i=0;i<original.labels.length;i++){
  const base=original.labels[i],edit=reviewed.labels[i];
  if(!base||base.expected!=='unknown'||base.evidence!==null||
   !edit||edit.url!==base.url||edit.code!==base.code)
   throw Error('Review case URL, issue code, or original draft was changed at position '+(i+1));
  const url=urlKey(base.url);
  if(!url||new URL(url).origin!==origin||!nonblank(base.code))
   throw Error('Original review case URL or issue code is invalid at position '+(i+1));
  const key=url+'|'+base.code;
  if(seen.has(key))throw Error('Duplicate original URL and issue code: '+key);
  seen.add(key);
  if(!decisions.has(edit.expected))
   throw Error('Review decision must be present, absent, or unknown at position '+(i+1));
  if(edit.expected==='unknown'){
   if(edit.evidence!=null)throw Error('Unknown decisions must not claim evidence at position '+(i+1));
   labels.push({url,code:base.code,expected:'unknown',evidence:null});
   continue;
  }
  if(auditTime===null)
   throw Error('Fresh, timezone-qualified audit generatedAt is required before accepting verified labels');
  const evidence=edit.evidence;
  const evidenceTime=zonedTime(evidence?.observedAt);
  if(!evidenceTypes.has(evidence?.type)||!nonblank(evidence?.detail)||
   evidence.detail.trim().length<15||evidenceTime===null)
   throw Error('Independent evidence needs type, timezone-qualified time and descriptive detail at position '+(i+1));
  if(Math.abs(evidenceTime-auditTime)>24*60*60*1000)
   throw Error('Evidence outside 24-hour audit window at position '+(i+1));
  reviewedCount++;
  labels.push({url,code:base.code,expected:edit.expected,
   evidence:{type:evidence.type,observedAt:evidence.observedAt,detail:evidence.detail.trim()}});
 }
 return {
  schemaVersion:SEO_GROUND_TRUTH_VERSION,website:original.website,
  reviewer:reviewed.reviewer.trim(),
  reviewStatus:'self_reported_unverified',
  independentReviewSignoffRequired:true,
  provenance:{sourceAuditGeneratedAt:original.provenance.sourceGeneratedAt||null,
   sourceScoringVersion:original.provenance.sourceScoringVersion||null,
   reviewedCaseCount:reviewedCount,unknownCaseCount:labels.length-reviewedCount},
  labels
 };
}
