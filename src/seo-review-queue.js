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
 // Round robin spreads review effort across both detected and undetected cases.
 const selected=[],count={detectedCandidates:0,undetectedControls:0};
 let pi=0,ni=0;
 while(selected.length<maxCases&&(pi<positives.length||ni<negatives.length)){
  const next=selected.length%2===0?(positives[pi++]||negatives[ni++]):(negatives[ni++]||positives[pi++]);
  if(!next)break;
  selected.push(next);
  if(next.detectedByMicirql)count.detectedCandidates++;else count.undetectedControls++;
 }
 const labels=selected.map(x=>({url:x.url,code:x.code,expected:'unknown',
  // A detected finding is a candidate, not ground truth. No evidence is fabricated.
  reviewHint:x.detectedByMicirql?'MiCirql reported this finding — independently verify it.':
   'MiCirql did not report this finding — independently check for misses.',
  evidence:null
 }));
 return {schemaVersion:SEO_REVIEW_QUEUE_VERSION,website:site,
  status:'draft_unreviewed',reviewer:null,
  instructions:'Review each URL and issue independently. Set expected to present or absent only with timestamped independent-http, independent-html or independent-link evidence. Then copy approved labels into micirql-seo-ground-truth-v1 format.',
  provenance:{source:'MiCirql audit JSON',sourceScoringVersion:audit.scoringVersion||null,
   inspectedPublicUrls:inspected.size,sourceIssueGroups:audit.issueCenter.length},
  candidates:count,totalCandidates:positives.length+negatives.length,
  selectedCount:labels.length,labels};
}
