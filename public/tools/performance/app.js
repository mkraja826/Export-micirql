import {validatePerformancePage,buildPerformanceReport} from './analyzer.js';
const $=id=>document.getElementById(id);
const input=$('url'),button=$('run'),form=$('audit'),status=$('extension-status');
let connected=false,busy=false,latest=null;
function handshake(ready){
 connected=ready;button.disabled=!connected||busy;
 status.textContent=ready?
  'MiCirql Chrome extension connected. Ready for a one-page lab observation.':
  'Compatible Chrome extension not detected. Install or reload MiCirql v0.3.22+.';
 $('extension-help').hidden=ready;
}
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'||
  event.data.type!=='MICIRQL_EXTENSION_READY')return;
 const state=event.data;
 handshake(state.protocol===3&&Array.isArray(state.capabilities)&&state.capabilities.includes('performance-navigation'));
});
const ping=()=>window.postMessage({source:'micirql-web',type:'MICIRQL_EXTENSION_PING',id:'performance-ping'},location.origin);
ping();setTimeout(ping,800);setTimeout(()=>{if(!connected)handshake(false)},1500);
function webAddress(raw){
 const value=raw.trim(),url=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
 return validatePerformancePage(url.href);
}
function request(url){
 return new Promise((resolve,reject)=>{
  const id='perf-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',listener)};
  const timer=setTimeout(()=>{cleanup();reject(Error('Chrome did not return a measurement within the 45-second limit'))},45000);
  const listener=event=>{
   if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'||
    event.data.id!==id||event.data.type!=='MICIRQL_PERFORMANCE_RESULT')return;
   cleanup();resolve(event.data);
  };
  window.addEventListener('message',listener);
  window.postMessage({source:'micirql-web',type:'MICIRQL_PERFORMANCE_OBSERVE',id,url},location.origin);
 });
}
function metric(name,value,description){
 const card=document.createElement('div');card.className='metric';
 const number=document.createElement('strong');number.textContent=Number.isFinite(value)?value.toLocaleString()+' ms':'Not observed';
 const label=document.createElement('span');label.textContent=name+' · '+description;card.append(number,label);
 $('metrics').append(card);
}
function typeCard(type,count){
 const card=document.createElement('div');card.className='item';
 const number=document.createElement('strong');number.textContent=Number.isInteger(count)?count:'Not observed';
 const label=document.createElement('small');label.textContent=type;card.append(number,label);
 $('resource-types').append(card);
}
function bytes(value){
 if(!Number.isFinite(value))return 'Not observed';
 if(value<1024)return value+' reported bytes';
 if(value<1048576)return (value/1024).toFixed(1)+' KiB reported';
 return (value/1048576).toFixed(2)+' MiB reported';
}
function render(report){
 latest=report;$('results').hidden=false;
 $('website').textContent=report.website;
 $('date').textContent='Generated '+new Date(report.generatedAt).toLocaleString();
 $('scope').textContent=report.status==='observed'?
  'One Chrome navigation observed on this device and current network. No cache normalization or simulated throttling. Do not compare this single result directly with field Core Web Vitals.':
  'Browser observation unverified: '+report.reason+'. Missing metrics are not zero and do not mean the page loaded quickly.';
 $('metrics').replaceChildren();
 for(const [code,label,description] of [
  ['responseStartMs','Response start','ms from navigation start'],
  ['responseEndMs','Response end','ms from navigation start'],
  ['domContentLoadedMs','DOM content ready','ms from navigation start'],
  ['loadEventMs','Load event','ms from navigation start'],
  ['firstContentfulPaintMs','First Contentful Paint','if exposed by Chrome']
 ])metric(label,report.metrics[code],description);
 $('resource-types').replaceChildren();
 const r=report.resources;
 $('resource-summary').textContent=r.entryCount===null?
  'Resource timing evidence was not verified. No resource quantities were assumed.':
  r.entryCount+' resource entries inspected; '+r.entriesWithTransferSize+' with reported transfer sizes; '+
  r.entriesWithoutTransferSize+' with hidden or zero transfer sizes; '+
  bytes(r.reportedTransferBytes)+'. '+(r.selectionTruncated?'Only the first 250 resource entries were inspected. ':
  'At most 250 resource entries were available. ')+
  'Resource timing bytes are incomplete when resources are cached or cross-origin size details are unavailable.';
 for(const type of ['script','css','img','font','fetch','xmlhttprequest','link','other'])
  typeCard(type,r.byInitiatorType?.[type]??null);
 $('cwv').textContent='LCP: not measured · CLS: not measured · INP: not measured. '+
  'FCP may be available as a browser navigation paint entry, but it is not LCP. '+
  'This report is not a Lighthouse score or field Core Web Vitals assessment.';
 $('limitations').replaceChildren();
 for(const note of report.limitations){
  const li=document.createElement('li');li.textContent=note;$('limitations').append(li);
 }
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!connected)return;
 let url;
 try{url=webAddress(input.value)}catch(error){status.textContent=error.message;return}
 busy=true;button.disabled=true;latest=null;$('results').hidden=true;$('progress-panel').hidden=false;
 $('progress').value=14;$('progress-text').textContent='Opening an isolated temporary tab and observing navigation timing…';
 try{
  const observation=await request(url);
  const report=buildPerformanceReport({website:url,observation});
  render(report);
  $('progress').value=100;
  $('progress-text').textContent=report.status==='observed'?
   'One browser navigation recorded. Print or save your PDF report.':
   'Browser observation was inconclusive. Report shows unverified metrics.';
 }catch(error){
  $('progress').value=0;
  $('progress-text').textContent='Browser observation failed: '+(error.message||error)+'. No successful measurement was inferred.';
 }finally{busy=false;button.disabled=!connected}
});
$('pdf').addEventListener('click',()=>{if(latest)window.print()});
try{const provided=new URLSearchParams(location.search).get('url');if(provided)input.value=webAddress(provided)}catch{}
