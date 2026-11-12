// Generate a review queue only; NEVER create independent ground truth automatically.
// User must verify every label and replace the placeholder reviewer metadata.
export const SEO_REVIEW_QUEUE_VERSION='micirql-seo-review-queue-v1';
const normalize=value=>{
 try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;u.hash='';return u.href}
 catch{return null}
};
const isPublic=p=>(p?.pageRole||'public')==='public';
const complete=p=>p?.auditStatus==='complete'&&p.partial!==true;
const verifiedHttpError=p=>p?.auditStatus==='invalid_http_status'&&p?.httpVerification?.verified===true&&
 Number.isInteger(p.httpVerification.status)&&p.httpVerification.status>=400;
const sort=(a,b)=>a.localeCompare(b);
export function createSeoReviewQueue(audit,{maxCases=60,codes=null}={}){
 if(!audit||typeof audit.website!=='string'||!Array.isArray(audit.reports)||!Array.isArray(audit.issueCenter))
  throw Error('A MiCirql audit with website, reports[] and issueCenter[] is required');
 if(!Number.isInteger(maxCases)||maxCases<1||maxCases>500)throw Error('maxCases must be 1–500');
 const site=normalize(audit.website);if(!site)throw Error('Invalid audit website');
 const origin=new URL(site).origin;
 const allowedCodes=codes===null?null:new Set(codes);
 const inspected=new Map();
 for(const page of audit.reports){
  const address=normalize(page?.requestedUrl||page?.url);
  if(!address||new URL(address).origin!==origin||!isPublic(page))continue;
  const prior=inspected.get(address);
  if(!prior||(complete(page)&&!complete(prior))||
    (verifiedHttpError(page)&&!complete(prior)&&!verifiedHttpError(prior)))inspected.set(address,page);
 }
 const found=new Map();
 for(const issue of audit.issueCenter){
  if(typeof issue?.code!=='string'||!issue.code.trim()||allowedCodes&&!allowedCodes.has(issue.code))continue;
  for(const raw of issue.affectedUrls||[]){
   const address=normalize(raw);
   if(!address||new URL(address).origin!==origin||!inspected.has(address))continue;
   const inspectedPage=inspected.get(address);
   if(!(complete(inspectedPage)||(issue.code.startsWith('http_')&&verifiedHttpError(inspectedPage))))continue;
   const id=address+'|'+issue.code;
   if(!found.has(id))found.set(id,{url:address,code:issue.code,detectedByMicirql:true});
  }
 }
 const positives=[...found.values()].sort((a,b)=>sort(a.code,b.code)||sort(a.url,b.url));
 const allCodes=[...new Set(positives.map(x=>x.code))].sort(sort);
 const negatives=[];
 for(const code of allCodes){
  for(const [address,p] of [...inspected].sort((a,b)=>sort(a[0],b[0]))){
   if(found.has(address+'|'+code))continue;
   if(!(complete(p)||(code.startsWith('http_')&&verifiedHttpError(p))))continue;
   negatives.push({url:address,code,detectedByMicirql:false});
  }
 }
 // Alternate detected candidates and undetected controls, while rotating across
 // issue codes within each type. A crowded issue group must not monopolize a
 // bounded review queue. All cases remain unverified until a reviewer checks them.
 const buckets=cases=>{
  const grouped=new Map(allCodes.map(code=>[code,{items:[],next:0}]));
  for(const item of cases)grouped.get(item.code).items.push(item);
  return grouped;
 };
 const detectedBuckets=buckets(positives),controlBuckets=buckets(negatives);
 const pointers={detected:0,control:0};
 const take=(grouped,kind)=>{
  for(let attempt=0;attempt<allCodes.length;attempt++){
   const index=(pointers[kind]+attempt)%allCodes.length;
   const bucket=grouped.get(allCodes[index]);
   if(bucket.next<bucket.items.length){
    pointers[kind]=(index+1)%allCodes.length;
    return bucket.items[bucket.next++];
   }
  }
  return null;
 };
 const selected=[],count={detectedCandidates:0,undetectedControls:0};
 let remainingDetected=positives.length,remainingControls=negatives.length;
 while(selected.length<maxCases&&(remainingDetected||remainingControls)){
  const preferDetected=selected.length%2===0;
  const next=preferDetected?
   (remainingDetected?take(detectedBuckets,'detected'):null)||
    (remainingControls?take(controlBuckets,'control'):null):
   (remainingControls?take(controlBuckets,'control'):null)||
    (remainingDetected?take(detectedBuckets,'detected'):null);
  if(!next)break;
  selected.push(next);
  if(next.detectedByMicirql){
   count.detectedCandidates++;remainingDetected--;
  }else{
   count.undetectedControls++;remainingControls--;
  }
 }
 const selectedByCode=allCodes.map(code=>({
  code,detectedCandidates:selected.filter(item=>item.code===code&&item.detectedByMicirql).length,
  undetectedControls:selected.filter(item=>item.code===code&&!item.detectedByMicirql).length
 })).filter(item=>item.detectedCandidates||item.undetectedControls);
 const labels=selected.map(x=>({url:x.url,code:x.code,expected:'unknown',
  // A detected finding is a candidate, not ground truth. No evidence is fabricated.
  reviewHint:x.detectedByMicirql?'MiCirql reported this finding — independently verify it.':
   'MiCirql did not report this finding — independently check for misses.',
  evidence:null
 }));
 return {schemaVersion:SEO_REVIEW_QUEUE_VERSION,website:site,
  status:'draft_unreviewed',reviewer:null,
  instructions:'Review each URL and issue independently. Set expected to present or absent only with timestamped independent-http, independent-html or independent-link evidence. Keep the unedited draft, review a separate copy, then run finalize-seo-review.mjs to create evaluator-ready labels. Never infer evidence from MiCirql findings.',
  provenance:{source:'MiCirql audit JSON',sourceScoringVersion:audit.scoringVersion||null,
   sourceGeneratedAt:audit.generatedAt||null,freshnessRequirement:'Independent evidence within 24 hours of audit generatedAt',
   inspectedPublicUrls:inspected.size,sourceIssueGroups:audit.issueCenter.length},
  candidates:count,totalCandidates:positives.length+negatives.length,
  sampling:{strategy:'balanced_issue_code_round_robin_v1',
   availableIssueCodes:allCodes.length,selectedIssueCodes:selectedByCode.length,
   selectedByCode},
  selectedCount:labels.length,labels};
}
