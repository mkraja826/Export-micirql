// MiCirql Accessibility Studio: bounded source and browser-observation evidence.
// No automatic WCAG conformance or accessibility score is issued.
import {inspectQaHtml} from '../qa/inspector.js';
export const ACCESSIBILITY_PAGE_LIMIT=60;
export const ACCESSIBILITY_LAYOUT_SAMPLES=3;
const SOURCE_CODES=new Set(['missing_image_alt','unlabelled_control','empty_button',
 'unnamed_link','duplicate_id','heading_jump','missing_h1']);
const LABELS={
 missing_image_alt:'Image has no detectable alt attribute (decorative intent not established)',
 unlabelled_control:'Form control might lack an accessible name',
 empty_button:'Button has no detectable accessible name',
 unnamed_link:'Link has no detectable accessible name',
 duplicate_id:'Repeated element ID may break labels and references',
 heading_jump:'Heading levels skip steps in document order',
 missing_h1:'Page has no H1 heading (advisory, not automatically a WCAG failure)',
 missing_document_language:'No nonempty language declaration on the HTML element',
 missing_document_title:'Document title was not detected in captured HTML'
};
const BROWSER_SIGNALS=[
 ['buttonsWithoutNames','visible_button_name_review','Visible buttons with no detected accessible name'],
 ['unlabelledVisibleFields','visible_field_name_review','Visible form controls that may lack an accessible label'],
 ['requiredFieldsWithoutLabels','required_field_label_review','Required visible form fields without detected labels'],
 ['customControlsWithoutTabFocus','custom_control_keyboard_review','Custom interactive controls without detected tab focus'],
 ['navigationWithoutTabFocus','navigation_keyboard_review','Navigation links excluded from normal tab focus'],
 ['smallNavigationTargets','small_target_review','Navigation targets smaller than 24px in at least one dimension; exceptions not evaluated']
];
const safeUrl=value=>{
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  u.hash='';return u.href;}catch{return null}
};
export function chooseAccessibilityPages(rawPages,website,limit=ACCESSIBILITY_PAGE_LIMIT){
 if(!Number.isInteger(limit)||limit<1||limit>ACCESSIBILITY_PAGE_LIMIT)throw Error('Page limit must be 1–60');
 const origin=new URL(website).origin;
 const pages=new Set();
 for(const raw of [website,...(Array.isArray(rawPages)?rawPages:[])]){
  const url=safeUrl(raw);if(url&&new URL(url).origin===origin)pages.add(url);
  if(pages.size>=limit)break;
 }
 return [...pages];
}
function sourceMetadata(html){
 const safe=String(html||'').replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(?:script|style|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript)\s*>/gi,' ');
 const opening=safe.match(/<html\b[^>]*>/i)?.[0]||'';
 const lang=opening.match(/\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
 const declaredLanguage=String(lang?.[1]??lang?.[2]??lang?.[3]??'').trim();
 const head=safe.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1]||'';
 const title=head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||'';
 return {declaredLanguage,hasTitle:Boolean(title.replace(/<[^>]+>/g,'').trim())};
}
export function inspectAccessibilityCapture({url,html,partial=false,httpStatus=null}){
 const parsed=safeUrl(url);if(!parsed)throw Error('Invalid inspection URL');
 if(partial===true||typeof html!=='string'||!html.trim())
  return {url:parsed,status:'unverified',reason:partial?'incomplete_html':'missing_html',groups:[],signalCount:0,counts:null};
 if(Number.isInteger(httpStatus)&&httpStatus>=400)
  return {url:parsed,status:'unverified',reason:'observed_http_'+httpStatus,groups:[],signalCount:0,counts:null};
 const qa=inspectQaHtml(html,parsed,{partial:false});
 if(qa.partial||qa.auditStatus!=='complete')
  return {url:parsed,status:'unverified',reason:'incomplete_html',groups:[],signalCount:0,counts:null};
 const meta=sourceMetadata(html),issues=qa.findings.filter(x=>SOURCE_CODES.has(x.code));
 if(!meta.declaredLanguage)issues.push({code:'missing_document_language',evidence:'html[lang]'});
 if(!meta.hasTitle)issues.push({code:'missing_document_title',evidence:'head > title'});
 const groups=new Map();
 for(const issue of issues){
  if(!groups.has(issue.code))groups.set(issue.code,{code:issue.code,label:LABELS[issue.code],count:0,evidenceSamples:[],
   classification:'source_review_candidate'});
  const group=groups.get(issue.code);group.count++;
  if(group.evidenceSamples.length<3&&issue.evidence)group.evidenceSamples.push(String(issue.evidence).slice(0,170));
 }
 return {url:parsed,status:'complete',reason:null,groups:[...groups.values()],
  signalCount:issues.length,counts:{...qa.counts},language:meta.declaredLanguage||null};
}
export function summarizeAccessibilityReport({website,pages=[],layoutSamples=[],discoveredPages=0,discoveryTruncated=false}){
 const root=safeUrl(website);if(!root)throw Error('Invalid website URL');
 const origin=new URL(root).origin;
 if(!Array.isArray(pages)||pages.length>ACCESSIBILITY_PAGE_LIMIT)throw Error('Too many inspected pages');
 if(!Array.isArray(layoutSamples)||layoutSamples.length>ACCESSIBILITY_LAYOUT_SAMPLES)
  throw Error('Too many browser layout samples');
 const seen=new Set(),records=[],browserRecords=[],browserSignals=[];
 for(const page of pages){
  const url=safeUrl(page?.url);
  if(!url||new URL(url).origin!==origin||seen.has(url))throw Error('Invalid or duplicate page');
  seen.add(url);
  const record=page?.status==='complete'?{
   url,status:'complete',signalCount:Math.max(0,Number(page.signalCount)||0),
   groups:Array.isArray(page.groups)?page.groups:[],counts:page.counts||null,
   language:page.language||null
  }:{url,status:'unverified',signalCount:0,groups:[],reason:String(page?.reason||'inspection_unverified')};
  records.push(record);
 }
 const pageSet=new Set(records.map(x=>x.url));
 const observedSet=new Set();
 for(const sample of layoutSamples){
  const url=safeUrl(sample?.url);
  if(!url||!pageSet.has(url)||observedSet.has(url))throw Error('Invalid or duplicate browser observation');
  observedSet.add(url);
  const observations=Array.isArray(sample?.observations)?sample.observations:[];
  const inspected=observations.filter(row=>row?.verified===true&&[375,768,1440].includes(row.width));
  browserRecords.push({url,verifiedWidths:inspected.map(x=>x.width),unverifiedWidths:[375,768,1440].filter(w=>!inspected.some(o=>o.width===w))});
  for(const observation of inspected)for(const [key,code,label] of BROWSER_SIGNALS){
   const count=observation[key];
   if(Number.isInteger(count)&&count>0)
    browserSignals.push({url,width:observation.width,code,label,count,
     classification:'browser_review_candidate'});
  }
 }
 const complete=records.filter(x=>x.status==='complete').length;
 const sourceSignals=records.reduce((n,p)=>n+p.signalCount,0);
 return {schemaVersion:1,tool:'accessibility',generatedAt:new Date().toISOString(),website:origin,
  coverage:{discoveredPages,discoveryTruncated:discoveryTruncated===true,selectedPages:records.length,
   completePages:complete,unverifiedPages:records.length-complete,layoutSamplePages:layoutSamples.length,
   verifiedLayoutWidthChecks:browserRecords.reduce((n,r)=>n+r.verifiedWidths.length,0),
   expectedLayoutWidthChecks:layoutSamples.length*3},
  summary:{sourceReviewSignals:sourceSignals,browserReviewSignals:browserSignals.reduce((n,x)=>n+x.count,0),
   sourceAffectedPages:records.filter(r=>r.status==='complete'&&r.signalCount>0).length},
  pages:records,browserSamples:browserRecords,browserSignals,
  manualReviewRequired:[
   'Contrast ratios and foreground/background color combinations were not verified',
   'Keyboard traversal, focus order, focus visibility and screen-reader behavior were not tested',
   'Alternatives for images, controls and media require human judgement',
   'This static and sampled browser inspection cannot certify WCAG conformance or accessibility compliance'
  ]};
}
