import {chooseAccessibilityPages,inspectAccessibilityCapture,summarizeAccessibilityReport} from './analyzer.js';
import {selectQaLayoutSamples} from '../qa/layout-sampling.js';
import {evaluateQaExtensionHandshake} from '../qa/extension-compat.js';
const $=id=>document.getElementById(id);
const form=$('audit'),input=$('url'),button=$('run'),status=$('extension-status'),progress=$('progress');
let connected=false,layoutSupported=false,busy=false,latest=null;
function updateConnection(payload){
 const state=evaluateQaExtensionHandshake(payload);
 connected=state.supported;layoutSupported=state.layoutSupported;button.disabled=!connected||busy;
 status.textContent=state.message;
 $('extension-help').hidden=layoutSupported;
}
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'||event.data.type!=='MICIRQL_EXTENSION_READY')return;
 updateConnection(event.data);
});
const ping=()=>window.postMessage({source:'micirql-web',type:'MICIRQL_EXTENSION_PING',id:'accessibility-ping'},location.origin);
ping();setTimeout(ping,900);
setTimeout(()=>{if(!connected){status.textContent='Extension not connected. Install or reload the MiCirql Chrome extension in desktop Chrome.';$('extension-help').hidden=false}},1500);
function website(raw){
 const value=raw.trim(),url=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname)throw Error('Enter a valid HTTP(S) website URL');
 url.hash='';return url;
}
function request(type,resultType,url,timeout=95000,progressType=null){
 return new Promise((resolve,reject)=>{
  const id='a11y-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  let timer=null;const started=Date.now(),hardLimit=1200000;
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',listener)};
  const arm=()=>{clearTimeout(timer);const remaining=Math.min(timeout,hardLimit-(Date.now()-started));
   if(remaining<=0){cleanup();reject(Error('Chrome operation exceeded the safety limit'));return}
   timer=setTimeout(()=>{cleanup();reject(Error('Chrome extension did not respond in time'))},remaining)};
  const listener=e=>{
   if(e.source!==window||e.origin!==location.origin||e.data?.source!=='micirql-extension'||e.data.id!==id)return;
   if(progressType&&e.data.type===progressType){
    const p=e.data.progress||{};
    $('progress-text').textContent='Discovering pages: '+(p.done||0)+' inspected, '+(p.found||0)+' found…';
    arm();return;
   }
   if(e.data.type!==resultType)return;
   cleanup();resolve(e.data);
  };
  window.addEventListener('message',listener);arm();
  window.postMessage({source:'micirql-web',type,id,url},location.origin);
 });
}
function update(message,pct){
 $('progress-text').textContent=message;progress.value=Math.max(0,Math.min(100,Math.round(pct)));
}
function metric(label,value){
 const box=document.createElement('div');box.className='metric';
 const big=document.createElement('strong');big.textContent=value;
 const small=document.createElement('span');small.textContent=label;box.append(big,small);$('metrics').append(box);
}
function finding(parent,title,details){
 const node=document.createElement('div');node.className='finding';
 const strong=document.createElement('strong');strong.textContent=title;node.append(strong);
 const text=document.createElement('small');text.textContent=details;node.append(text);parent.append(node);
}
function render(report){
 latest=report;$('results').hidden=false;
 $('website').textContent=report.website;
 $('report-date').textContent='Generated '+new Date(report.generatedAt).toLocaleString();
 $('metrics').replaceChildren();
 metric('Complete source pages',report.coverage.completePages+' / '+report.coverage.selectedPages);
 metric('Source review signals',report.summary.sourceReviewSignals);
 metric('Browser review signals',report.summary.browserReviewSignals);
 metric('Browser checks observed',report.coverage.verifiedLayoutWidthChecks+' / '+report.coverage.expectedLayoutWidthChecks);
 $('coverage').textContent=report.coverage.unverifiedPages+' source page(s) unverified. '+
  'Browser observations sampled on '+report.coverage.layoutSamplePages+' pages; '+
  (report.coverage.discoveryTruncated?'discovery may be limited. ':'')+
  'These review signals are not an accessibility compliance score or a verified WCAG failure count.';
 const summaries=new Map();
 for(const p of report.pages.filter(r=>r.status==='complete'))for(const g of p.groups){
  if(!summaries.has(g.code))summaries.set(g.code,{label:g.label,count:0,pages:new Set()});
  const entry=summaries.get(g.code);entry.count+=g.count;entry.pages.add(p.url);
 }
 $('source-findings').replaceChildren();
 if(!summaries.size)finding($('source-findings'),'No source review signals observed',
  'This does not imply the website passed an accessibility audit.');
 for(const group of summaries.values())finding($('source-findings'),
  group.label+' · '+group.count+' occurrences',
  group.pages.size+' affected page(s): '+[...group.pages].slice(0,5).join(', ')+(group.pages.size>5?' and more':''));
 $('browser-findings').replaceChildren();
 $('browser-summary').textContent=report.coverage.verifiedLayoutWidthChecks+' of '+report.coverage.expectedLayoutWidthChecks+
  ' sampled viewport checks verified. A sample is not a full keyboard test, contrast test, or screen-reader audit.';
 if(!report.browserSignals.length)finding($('browser-findings'),'No browser review signals measured',
  'This is not a pass; some observations may be unavailable or require human review.');
 for(const s of report.browserSignals)finding($('browser-findings'),s.label+' · '+s.count,
  s.width+'px · '+s.url+' · Browser-observed count; context and exceptions require manual checking.');
 $('pages').replaceChildren();
 for(const p of report.pages){
  const section=document.createElement('div');section.className='page';
  const header=document.createElement('h3');header.textContent=p.url;
  const detail=document.createElement('p');detail.className='small';
  detail.textContent=p.status==='complete'?
   'Source inspected · '+p.signalCount+' review signal(s) · language: '+(p.language||'not declared'):
   'Source unverified · '+p.reason;
  section.append(header,detail);$('pages').append(section);
 }
 $('manual').replaceChildren();
 for(const point of report.manualReviewRequired){const item=document.createElement('li');item.textContent=point;$('manual').append(item)}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!connected)return;
 let target;try{target=website(input.value)}catch(error){status.textContent=error.message;return}
 busy=true;button.disabled=true;$('results').hidden=true;$('progress-card').hidden=false;latest=null;
 try{
  update('Discovering public pages through the Chrome extension…',2);
  const discovery=await request('MICIRQL_DISCOVER','MICIRQL_DISCOVER_RESULT',target.href,600000,'MICIRQL_DISCOVER_PROGRESS');
  if(!discovery.ok)throw Error(discovery.error||'Page discovery unavailable');
  const pages=chooseAccessibilityPages(discovery.pages||[],target.href,60);
  if(!pages.length)throw Error('No eligible pages discovered');
  const results=[];
  for(let i=0;i<pages.length;i++){
   const url=pages[i];update('Inspecting source '+(i+1)+' of '+pages.length+': '+url,5+i/pages.length*75);
   try{
    const response=await request('MICIRQL_SEO_READ','MICIRQL_SEO_RESULT',url,95000);
    if(!response.ok)throw Error(response.error||'HTML inspection failed');
    const final=new URL(response.url||url);
    if(final.origin!==target.origin)throw Error('Page redirected to a different origin');
    results.push(inspectAccessibilityCapture({url,html:response.html,partial:response.partial===true,
     httpStatus:response.httpEvidence?.observed?response.httpEvidence.status:null}));
   }catch(error){results.push({url,status:'unverified',reason:String(error?.message||error).slice(0,160),groups:[],signalCount:0})}
  }
  const samples=[];
  const pageSamples=layoutSupported?selectQaLayoutSamples(results.filter(x=>x.status==='complete')
   .map(x=>({...x,partial:false,requestedUrl:x.url})),target.href,3):[];
  for(let i=0;i<pageSamples.length;i++){
   const url=pageSamples[i].url;
   update('Checking read-only browser controls '+(i+1)+' of '+pageSamples.length+' sampled pages…',
    83+i/pageSamples.length*14);
   try{
    const observation=await request('MICIRQL_QA_LAYOUT','MICIRQL_QA_LAYOUT_RESULT',url,100000);
    samples.push({url,observations:observation.ok?observation.observations||[]:[]});
   }catch{samples.push({url,observations:[]})}
  }
  const summary=summarizeAccessibilityReport({website:target.origin,pages:results,layoutSamples:samples,
   discoveredPages:discovery.originalCount||discovery.pages?.length||pages.length,
   discoveryTruncated:discovery.truncated===true});
  render(summary);update('Accessibility review ready. Select Print / Save PDF report.',100);
 }catch(error){update('Review failed: '+(error?.message||error)+'. No incomplete scan was marked complete.',0)}
 finally{busy=false;button.disabled=!connected}
});
$('pdf').addEventListener('click',()=>{if(latest)window.print()});
try{const initial=new URLSearchParams(location.search).get('url');if(initial)input.value=website(initial).href}catch{}
