// MiCirql Performance Lab: read-only, single-navigation browser observation.
// This is NOT Lighthouse, throttled lab testing, field Core Web Vitals, or a
// performance score. Null means unobserved; zero is never substituted.
export const PERFORMANCE_METRIC_CODES=Object.freeze([
 'responseStartMs','responseEndMs','domContentLoadedMs','loadEventMs','firstContentfulPaintMs'
]);
const publicPage=value=>{
 try{
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)return null;
  if(u.port&&u.port!=='80'&&u.port!=='443')return null;
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||
   host.endsWith('.local')||host.endsWith('.internal')||
   /^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':'))return null;
  if(/\.(?:pdf|zip|png|jpe?g|gif|svg|webp|css|js|json|xml|mp4|mp3|woff2?)$/i.test(u.pathname))return null;
  if(/(?:^|\/)(?:api|logout|log-out|signout|sign-out|delete|remove|destroy|edit|admin|login|signin|signup|register|account|auth|checkout|purchase|payment|reset-password|unsubscribe|cancel|download|export)(?:\/|$)/i.test(u.pathname))return null;
  return u.href;
 }catch{return null}
};
export function validatePerformancePage(value){
 const result=publicPage(value);
 if(!result)throw Error('Enter a public HTTP(S) page without credentials, query parameters or action routes');
 return result;
}
function safeTime(value){
 return Number.isFinite(value)&&value>0&&value<=300000?Math.max(1,Math.round(value)):null;
}
function safeCount(value){
 return Number.isInteger(value)&&value>=0&&value<=100000?value:null;
}
function safeBytes(value){
 return Number.isFinite(value)&&value>=0&&value<=1000000000?Math.round(value):null;
}
const RESOURCE_TYPES=['script','css','img','font','fetch','xmlhttprequest','link','other'];
export function buildPerformanceReport({website,observation}){
 const requested=validatePerformancePage(website);
 const finalUrl=typeof observation?.url==='string'?publicPage(observation.url):null;
 const samePage=finalUrl===requested;
 const candidateTiming=observation?.timing||{};
 const hasMeasuredTiming=PERFORMANCE_METRIC_CODES.some(code=>safeTime(candidateTiming[code])!==null);
 const verified=observation?.ok===true&&observation?.observed===true&&samePage&&
  observation.scope==='one_unthrottled_browser_navigation'&&observation.readyState==='complete'&&hasMeasuredTiming;
 const timing=verified?candidateTiming:{};
 const metrics=Object.fromEntries(PERFORMANCE_METRIC_CODES.map(code=>[code,safeTime(timing[code])]));
 const counts=verified?observation?.resources||{}:{};
 const totalResources=safeCount(counts.entryCount);
 const countedResources=safeCount(counts.entriesWithTransferSize);
 const unknownSizedResources=safeCount(counts.entriesWithoutTransferSize);
 const bytes=safeBytes(counts.reportedTransferBytes);
 const byType={};
 for(const type of RESOURCE_TYPES)byType[type]=verified?safeCount(counts.byInitiatorType?.[type]):null;
 const reliableResourceSummary=verified&&totalResources!==null&&countedResources!==null&&unknownSizedResources!==null&&
  countedResources+unknownSizedResources===totalResources&&bytes!==null;
 const state=verified?'observed':'unverified';
 const reason=verified?null:String(observation?.reason||observation?.error||
   (observation?.observed&&(!samePage?'loaded_url_mismatch':
    !hasMeasuredTiming?'navigation_timing_not_observed':'observation_incomplete'))||
   'browser_measurement_unavailable').slice(0,180);
 return {schemaVersion:1,tool:'performance',generatedAt:new Date().toISOString(),website:requested,
  status:state,reason,scope:{pagesRequested:1,pagesMeasured:verified?1:0,
   measurement:'one_Chrome_navigation_unthrottled',source:'browser_performance_timing',
   userDevice:true,simulationThrottled:false,fieldData:false},
  metrics:verified?metrics:Object.fromEntries(PERFORMANCE_METRIC_CODES.map(code=>[code,null])),
  resources:{entryCount:reliableResourceSummary?totalResources:null,
   entriesWithTransferSize:reliableResourceSummary?countedResources:null,
   entriesWithoutTransferSize:reliableResourceSummary?unknownSizedResources:null,
   reportedTransferBytes:reliableResourceSummary?bytes:null,
   selectionTruncated:reliableResourceSummary?counts.selectionTruncated===true:null,
   byInitiatorType:reliableResourceSummary?byType:null},
  evidence:{readyState:verified?'complete':null,finalUrl:verified?finalUrl:null,
   userAgentFamily:'Chromium extension',documentNavigationOnly:true},
  unavailableCoreWebVitals:{
   LCP:'not_measured',CLS:'not_measured',INP:'not_measured',
   explanation:'Lab navigation timing cannot establish field Core Web Vitals. FCP, when observed, is a one-run paint entry, not an LCP measurement.'
  },
  limitations:[
   'One observation on the user’s current Chrome device and network, without simulated slow devices or cold-cache control',
   'Response start, DOM ready and load times are navigation timeline measurements; First Contentful Paint may be unavailable in background tabs',
   'Resource sizes may be hidden by cross-origin privacy rules or cache, so reported transfer bytes are not full website transfer size',
   'Up to 250 resource timing entries are considered; a truncated or timing-buffer-limited view is not a full network waterfall',
   'No field Core Web Vitals (LCP, CLS, INP), Lighthouse performance score, CPU profiling, or guaranteed visual completion'
  ]};
}
