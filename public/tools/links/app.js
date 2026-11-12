import {inspectSeoHtml} from '../seo/inspector.js';
import {chooseAuditedPages,buildLinkAudit,LINK_AUDIT_DESTINATION_LIMIT} from './analyzer.js';
const $=id=>document.getElementById(id);
const form=$('audit'),button=$('run'),input=$('url'),extension=$('extension-status'),status=$('progress-text'),progress=$('progress');
let connected=false,busy=false,latest=null;
function setExtensionReady(ready){
 connected=ready;button.disabled=!ready||busy;
 extension.textContent=ready?'Chrome extension connected. Ready for a read-only scan.':'Extension not connected. Install/reload the latest MiCirql extension in desktop Chrome.';
 $('extension-help').hidden=ready;
}
function announce(){
 window.postMessage({source:'micirql-web',type:'MICIRQL_EXTENSION_PING',id:'links-ping'},location.origin);
}
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension')return;
 if(event.data.type==='MICIRQL_EXTENSION_READY')setExtensionReady(true);
});
announce();setTimeout(announce,800);setTimeout(()=>{if(!connected)setExtensionReady(false)},1500);
function normalizedUrl(value){
 const raw=value.trim();
 const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname)throw Error('Enter a valid HTTP(S) website address');
 url.hash='';return url;
}
function request(type,resultType,url,timeoutMs=30000,progressEvent=null){
 return new Promise((resolve,reject)=>{
  const id='links-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  let timer=null;
  const started=Date.now(),hardLimit=1200000;
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',onMessage)};
  const arm=()=>{
   clearTimeout(timer);
   const time=Math.min(timeoutMs,hardLimit-(Date.now()-started));
   if(time<=0){cleanup();reject(Error('Chrome extension operation exceeded its safety limit'));return}
   timer=setTimeout(()=>{cleanup();reject(Error('Chrome extension did not respond; check its status'))},time);
  };
  const onMessage=event=>{
   if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'||event.data.id!==id)return;
   if(progressEvent&&event.data.type===progressEvent){
    const p=event.data.progress||{};
    status.textContent='Discovering pages: '+(p.done||0)+' inspected, '+(p.found||0)+' found…';
    arm();return;
   }
   if(event.data.type!==resultType)return;
   cleanup();resolve(event.data);
  };
  window.addEventListener('message',onMessage);arm();
  window.postMessage({source:'micirql-web',type,id,url},location.origin);
 });
}
function update(message,value){
 status.textContent=message;
 progress.value=Math.min(100,Math.max(0,Math.round(value)));
}
function addMetric(label,value){
 const item=document.createElement('div');item.className='metric';
 const strong=document.createElement('strong');strong.textContent=value;
 const small=document.createElement('small');small.textContent=label;
 item.append(strong,small);$('metrics').append(item);
}
function render(report){
 latest=report;
 $('results').hidden=false;
 $('website').textContent=report.website;
 $('report-date').textContent='Generated '+new Date(report.generatedAt).toLocaleString();
 $('metrics').replaceChildren();
 addMetric('Confirmed broken (404/410)',report.summary.broken);
 addMetric('HTTP server errors (5xx)',report.summary.serverErrors);
 addMetric('Reachable destinations',report.summary.reachable);
 addMetric('Unverified or unchecked',report.summary.unverified+report.summary.notChecked);
 const s=report.scope;
 $('scope').textContent=s.completePages+' of '+s.selectedPages+' selected pages inspected successfully. '+s.checkedDestinations+' of '+s.uniqueInternalDestinations+' unique internal link destinations checked. '+(s.discoveryTruncated?'Page discovery hit its limit; additional pages may exist. ':'')+(s.destinationSelectionLimited?'Not all destinations were checked. ':'')+'Unverified outcomes are not counted as broken.';
 const map={checked:'Observed sitemap',not_found:'Sitemap not found at /sitemap.xml',unverified:'Sitemap not verified',needs_review:'Sitemap requires review'};
 $('sitemap').textContent=(map[report.sitemap.state]||'Sitemap status unknown')+': '+report.sitemap.message+(report.sitemap.state==='checked'?'; '+report.sitemap.listedCount+' listed URLs, '+report.sitemap.externalCount+' external origin(s) or URLs.':'');
 $('destinations').replaceChildren();
 if(!report.links.length){
  const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='No internal links extracted from the successfully inspected pages.';tr.append(td);$('destinations').append(tr);
 }
 for(const link of report.links){
  const tr=document.createElement('tr');
  const label=link.classification==='broken'?'Confirmed broken':link.classification==='server_error'?'Server error':link.classification==='reachable'?(link.finalUrl&&link.finalUrl!==link.destination?'Reachable (redirected)':'Reachable'):link.classification==='not_checked'?'Not checked':'Unverified';
  for(const value of [link.destination,label,link.status===null?'—':String(link.status),link.referringPages.join(', ')]){
   const td=document.createElement('td');td.textContent=value;tr.append(td);
  }
  $('destinations').append(tr);
 }
 const invalid=report.pages.filter(p=>p.status!=='complete');
 $('pages').textContent=s.completePages+' complete, '+invalid.length+' unverified.'+(invalid.length?' Incomplete pages: '+invalid.slice(0,20).map(p=>p.url+' ('+p.reason+')').join('; '):'');
}
form.addEventListener('submit',async e=>{
 e.preventDefault();if(!connected||busy)return;
 let site;try{site=normalizedUrl(input.value)}catch(error){extension.textContent=error.message;return}
 busy=true;button.disabled=true;$('results').hidden=true;$('progress-wrap').hidden=false;latest=null;
 const pageResults=[],diagnostics=[];
 let selected=[],discovered=0,truncated=false,sitemap=null;
 try{
  update('Discovering website pages using Chrome extension…',1);
  const discovery=await request('MICIRQL_DISCOVER','MICIRQL_DISCOVER_RESULT',site.href,600000,'MICIRQL_DISCOVER_PROGRESS');
  if(!discovery.ok)throw Error(discovery.error||'Page discovery failed');
  selected=chooseAuditedPages([site.href,...(discovery.pages||[])],site.origin,60);
  discovered=Number.isInteger(discovery.originalCount)?discovery.originalCount:(discovery.pages||[]).length;
  truncated=discovery.truncated===true||(discovery.pages||[]).length>60;
  if(!selected.length)throw Error('No eligible same-origin pages discovered');
  for(let i=0;i<selected.length;i++){
   const url=selected[i];update('Inspecting page '+(i+1)+' of '+selected.length+': '+url,5+Math.floor(i/selected.length*57));
   try{
    const result=await request('MICIRQL_SEO_READ','MICIRQL_SEO_RESULT',url,90000);
    if(!result.ok||result.partial===true)throw Error(result.error||'Incomplete HTML capture');
    const inspected=inspectSeoHtml(result.html,result.url||url);
    if(inspected.partial===true||inspected.auditStatus!=='complete')throw Error('Page HTML could not be fully verified');
    pageResults.push({url,complete:true,targets:inspected.internalLinkTargets||[]});
   }catch(error){pageResults.push({url,complete:false,reason:String(error.message||error).slice(0,150)})}
  }
  const seen=new Set(),all=[];
  for(const page of pageResults.filter(p=>p.complete)){
   for(const raw of page.targets||[]){
    try{const u=new URL(raw);u.hash='';if(u.origin!==site.origin||seen.has(u.href))continue;seen.add(u.href);all.push(u.href)}catch{}
   }
  }
  all.sort();
  const limited=all.slice(0,LINK_AUDIT_DESTINATION_LIMIT);
  for(let i=0;i<limited.length;i++){
   const url=limited[i];update('Checking link '+(i+1)+' of '+limited.length,63+Math.floor(i/Math.max(1,limited.length)*32));
   try{
    const obs=await request('MICIRQL_SEO_LINK_CHECK','MICIRQL_SEO_LINK_RESULT',url,17000);
    diagnostics.push({destination:url,...obs});
   }catch(error){diagnostics.push({destination:url,ok:false,reason:String(error.message||error).slice(0,150)})}
  }
  update('Checking sitemap at /sitemap.xml…',96);
  try{sitemap=await request('MICIRQL_LINK_SITEMAP','MICIRQL_LINK_SITEMAP_RESULT',site.origin,18000)}
  catch(error){sitemap={ok:false,observed:false,reason:String(error.message||error)}}
  const report=buildLinkAudit({website:site.origin,pages:pageResults,diagnostics,
   discovered,discoveryTruncated:truncated,sitemap});
  render(report);update('Report ready. Select Print / Save PDF report.',100);
 }catch(error){
  update('Scan failed: '+(error?.message||error)+'. No partial results were presented as a complete report.',0);
 }finally{busy=false;button.disabled=!connected}
});
$('pdf').addEventListener('click',()=>{if(latest)window.print()});
try{const p=new URLSearchParams(location.search).get('url');if(p)input.value=normalizedUrl(p).href}catch{}
