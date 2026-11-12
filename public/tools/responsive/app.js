import {evaluateQaExtensionHandshake} from '../qa/extension-compat.js';
import {chooseResponsiveSamples,buildResponsiveReport} from './analyzer.js';
const $=id=>document.getElementById(id);
const input=$('url'),button=$('run'),status=$('extension-status'),form=$('audit'),progress=$('progress');
let compatible=false,busy=false,latest=null;
function ready(value,message){
 compatible=value;button.disabled=busy||!compatible;
 status.textContent=message|| (value?'Chrome extension connected. Ready for read-only layout inspection.':'Updated MiCirql Chrome extension required.');
 $('extension-help').hidden=value;
}
window.addEventListener('message',e=>{
 if(e.source!==window||e.origin!==location.origin||e.data?.source!=='micirql-extension'||e.data.type!=='MICIRQL_EXTENSION_READY')return;
 const c=evaluateQaExtensionHandshake(e.data);
 ready(c.layoutSupported,c.message);
});
function ping(){window.postMessage({source:'micirql-web',type:'MICIRQL_EXTENSION_PING',id:'responsive-ping'},location.origin)}
ping();setTimeout(ping,800);setTimeout(()=>{if(!compatible)ready(false,'Compatible extension not detected. Install or reload the latest extension in desktop Chrome.')},1500);
function address(raw){
 const value=raw.trim(),u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname)
  throw Error('Enter a valid HTTP(S) URL without credentials');
 u.hash='';return u;
}
function request(type,resultType,url,timeoutMs=100000,progressType=null){
 return new Promise((resolve,reject)=>{
  const id='responsive-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const started=Date.now(),maximum=1200000;
  let timer;
  const clean=()=>{clearTimeout(timer);window.removeEventListener('message',receive)};
  const arm=()=>{
   clearTimeout(timer);const left=Math.min(timeoutMs,maximum-(Date.now()-started));
   if(left<=0){clean();reject(Error('Extension request exceeded its safety limit'));return}
   timer=setTimeout(()=>{clean();reject(Error('Extension did not respond; check its status and retry'))},left);
  };
  const receive=e=>{
   if(e.source!==window||e.origin!==location.origin||e.data?.source!=='micirql-extension'||e.data.id!==id)return;
   if(progressType&&e.data.type===progressType){
    const p=e.data.progress||{};
    $('progress-text').textContent='Discovering pages: '+(p.done||0)+' inspected, '+(p.found||0)+' found…';
    arm();return;
   }
   if(e.data.type!==resultType)return;
   clean();resolve(e.data);
  };
  window.addEventListener('message',receive);arm();
  window.postMessage({source:'micirql-web',type,id,url},location.origin);
 });
}
function note(text,pct){$('progress-text').textContent=text;progress.value=Math.max(0,Math.min(100,Math.round(pct)))}
function metric(label,value){
 const element=document.createElement('div');element.className='metric';
 const strong=document.createElement('strong');strong.textContent=value;
 const span=document.createElement('span');span.textContent=label;element.append(strong,span);$('metrics').append(element);
}
function render(r){
 latest=r;
 $('results').hidden=false;$('website').textContent=r.website;
 $('report-date').textContent='Generated '+new Date(r.generatedAt).toLocaleString();
 $('metrics').replaceChildren();
 metric('Verified viewport checks',r.coverage.verifiedViewportChecks+' / '+r.coverage.expectedViewportChecks);
 metric('Horizontal overflow signals',r.summary.measuredOverflowSignals);
 metric('Mobile scaling or viewport signals',r.summary.scaledMobileSignals+r.summary.missingMobileViewportSignals);
 metric('Unverified viewport checks',r.coverage.unverifiedViewportChecks);
 $('coverage').textContent='Sampled '+r.coverage.sampledPages+' of '+r.coverage.discoveredPages+' discovered pages. '+
  (r.coverage.discoveryTruncated?'Discovery may have reached its limit. ':'')+
  'The report covers only selected pages, and an absence of recorded signals does not prove visual correctness.';
 $('signals').replaceChildren();
 if(!r.signals.length){
  const p=document.createElement('p');p.textContent='No review signals were observed in verified viewport measurements. This is not a whole-site pass.';$('signals').append(p);
 }
 for(const s of r.signals){
  const p=document.createElement('p');p.className='note';
  p.textContent=s.width+'px · '+s.url+' · '+s.summary;
  $('signals').append(p);
 }
 $('pages').replaceChildren();
 for(const page of r.pages){
  const section=document.createElement('section');section.className='page';
  const title=document.createElement('h3');title.textContent=page.url;section.append(title);
  const columns=document.createElement('div');columns.className='measurements';
  for(const observation of page.viewports){
   const cell=document.createElement('div');cell.className='measure';
   const head=document.createElement('strong');head.textContent=observation.width+'px · '+(observation.verification==='verified'?'Measured':'Unverified');
   const description=document.createElement('p');
   description.textContent=observation.verification==='verified'?
    'CSS viewport '+observation.observedCssWidth+'px; document width '+observation.documentWidth+
    'px; horizontal overflow '+observation.horizontalOverflowPx+'px.'+(observation.scaledMobileLayout?' Mobile scaling detected.':'')+
    (observation.missingMobileViewportMeta?' Viewport meta absent.':''):
    'No trustworthy observation: '+observation.reason;
   cell.append(head,description);columns.append(cell);
  }
  section.append(columns);$('pages').append(section);
 }
 $('limitations').replaceChildren();
 for(const message of r.limitations){
  const li=document.createElement('li');li.textContent=message;$('limitations').append(li);
 }
}
form.addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!compatible)return;
 let url;try{url=address(input.value)}catch(error){status.textContent=error.message;return}
 busy=true;button.disabled=true;latest=null;
 $('results').hidden=true;$('progress-card').hidden=false;
 try{
  note('Discovering public pages with the Chrome extension…',3);
  const discovery=await request('MICIRQL_DISCOVER','MICIRQL_DISCOVER_RESULT',url.href,600000,'MICIRQL_DISCOVER_PROGRESS');
  if(!discovery.ok)throw Error(discovery.error||'Page discovery failed');
  const selection=chooseResponsiveSamples(discovery.pages||[],url.href,3);
  const samples=[];
  for(let i=0;i<selection.selectedPages.length;i++){
   const pageUrl=selection.selectedPages[i];
   note('Measuring '+(i+1)+' of '+selection.selectedPages.length+' sampled pages at 375, 768 and 1440px…',
    10+(i/selection.selectedPages.length)*78);
   try{
    const reply=await request('MICIRQL_QA_LAYOUT','MICIRQL_QA_LAYOUT_RESULT',pageUrl,100000);
    samples.push({requestedUrl:pageUrl,observations:reply.ok&&Array.isArray(reply.observations)?reply.observations:[],
     error:reply.ok?null:reply.error||'Browser layout observation unavailable'});
   }catch(error){samples.push({requestedUrl:pageUrl,observations:[],error:String(error.message||error).slice(0,180)})}
  }
  const report=buildResponsiveReport({website:url.origin,discoveredPages:selection.discoveredValidPages,
   discoveryTruncated:discovery.truncated===true,samples});
  render(report);note('Responsive report ready. Select Print / Save PDF report.',100);
 }catch(error){note('Scan failed: '+(error.message||error)+'; no report was marked complete.',0)}
 finally{busy=false;button.disabled=!compatible}
});
$('pdf').addEventListener('click',()=>{if(latest)window.print()});
try{const incoming=new URLSearchParams(location.search).get('url');if(incoming)input.value=address(incoming).href}catch{}
