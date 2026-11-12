import {chooseSecurityPages,buildSecurityReport} from './analyzer.js';
const $=id=>document.getElementById(id);
const urlInput=$('url'),button=$('run'),form=$('audit'),extensionStatus=$('extension-status');
let connected=false,busy=false,latest=null;
function extensionReady(ready){
 connected=ready;button.disabled=!ready||busy;
 extensionStatus.textContent=ready?
  'MiCirql extension connected. Public, read-only header checks are ready.':
  'Compatible extension not found. Install or reload MiCirql Chrome extension v0.3.21+.';
 $('extension-help').hidden=ready;
}
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'
  ||event.data.type!=='MICIRQL_EXTENSION_READY')return;
 const p=event.data;
 extensionReady(p.protocol===3&&Array.isArray(p.capabilities)&&p.capabilities.includes('security-headers')
  &&typeof p.extensionVersion==='string');
});
const ping=()=>window.postMessage({source:'micirql-web',type:'MICIRQL_EXTENSION_PING',id:'security-ping'},location.origin);
ping();setTimeout(ping,800);setTimeout(()=>{if(!connected)extensionReady(false)},1500);
function normalize(value){
 const text=value.trim(),u=new URL(/^https?:\/\//i.test(text)?text:'https://'+text);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname)throw Error('Enter a public HTTP(S) URL');
 u.hash='';return u;
}
function request(type,resultType,url,timeout=30000,progressType=null){
 return new Promise((resolve,reject)=>{
  const id='security-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  let timer;const start=Date.now(),hardLimit=1200000;
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive)};
  function arm(){clearTimeout(timer);const remaining=Math.min(timeout,hardLimit-(Date.now()-start));
   if(remaining<=0){cleanup();reject(Error('Chrome extension request safety limit exceeded'));return}
   timer=setTimeout(()=>{cleanup();reject(Error('Chrome extension did not respond'))},remaining);
  }
  function receive(event){
   if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension'
    ||event.data.id!==id)return;
   if(progressType&&event.data.type===progressType){
    const p=event.data.progress||{};
    $('progress-text').textContent='Discovering '+(p.done||0)+' inspected pages, '+(p.found||0)+' found…';
    arm();return;
   }
   if(event.data.type!==resultType)return;
   cleanup();resolve(event.data);
  }
  window.addEventListener('message',receive);arm();
  window.postMessage({source:'micirql-web',type,id,url},location.origin);
 });
}
function progress(text,pct){
 $('progress-text').textContent=text;
 $('progress').value=Math.min(100,Math.max(0,Math.round(pct)));
}
function metric(label,value){
 const node=document.createElement('div');node.className='metric';
 const strong=document.createElement('strong');strong.textContent=value;
 const span=document.createElement('span');span.textContent=label;
 node.append(strong,span);$('metrics').append(node);
}
function textElement(tag,text,cls){
 const element=document.createElement(tag);
 if(cls)element.className=cls;
 element.textContent=text;return element;
}
function render(report){
 latest=report;$('results').hidden=false;
 $('website').textContent=report.website;
 $('date').textContent='Generated '+new Date(report.generatedAt).toLocaleString();
 $('metrics').replaceChildren();
 metric('HTTP responses assessed',report.scope.observedResponses+' / '+report.scope.sampledPages);
 metric('Observed header signals',report.summary.observedHeaderChecks);
 metric('Configuration review candidates',report.summary.reviewCandidates);
 metric('Redirects / HTTP errors / unverified',report.scope.redirectsNotFollowed+report.scope.httpErrors+report.scope.unverified);
 $('scope').textContent='Sampled '+report.scope.sampledPages+' of '+report.scope.discoveredPages+
  ' candidate pages. '+(report.scope.discoveryTruncated?'Page discovery may be truncated. ':'')+
  'A missing header is not a confirmed vulnerability, and observed headers are not evidence of overall website security.';
 $('pages').replaceChildren();
 for(const row of report.pages){
  const section=document.createElement('section');section.className='page';
  section.append(textElement('h3',row.url),
   textElement('p',row.state==='observed'?'Observed HTTP '+row.status+
    ' · browser GET response headers only':
    row.state==='redirect'?'Observed HTTP '+row.status+' redirect; not followed':
    row.state==='http_error'?'Observed HTTP '+row.status+'; header completeness not evaluated':
    'Response unverified · '+row.reason,'small muted'));
  if(row.state==='redirect'&&row.location)section.append(textElement('p','Location header: '+row.location,'small'));
  for(const check of row.checks){
   const wrapper=document.createElement('div');wrapper.className='review';
   wrapper.append(textElement('strong',check.label),
    textElement('small',check.state.replaceAll('_',' ')+' · '+check.detail));
   section.append(wrapper);
  }
  if(row.state==='observed'){
   const raw=textElement('p','Observed allowlisted headers: '+
    (Object.entries(row.headers).map(([key,value])=>key+': '+value).join(' | ')||'none of the listed headers'),
    'raw');
   section.append(raw);
  }
  $('pages').append(section);
 }
 $('limitations').replaceChildren();
 for(const limitation of report.limitations)$('limitations').append(textElement('li',limitation));
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!connected)return;
 let site,selection;
 try{site=normalize(urlInput.value);selection=chooseSecurityPages([],site.href);}
 catch(error){extensionStatus.textContent=error.message;return}
 busy=true;button.disabled=true;latest=null;$('results').hidden=true;$('progress-panel').hidden=false;
 try{
  progress('Discovering safe public pages…',3);
  let discovery={ok:false,pages:[],truncated:false};
  try{discovery=await request('MICIRQL_DISCOVER','MICIRQL_DISCOVER_RESULT',site.href,600000,'MICIRQL_DISCOVER_PROGRESS')}
  catch{/* Homepage header check can still proceed; discovery remains unverified. */}
  if(discovery.ok){
   selection=chooseSecurityPages(discovery.pages||[],site.href);
  }
  const observations=[];
  for(let i=0;i<selection.selectedPages.length;i++){
   const address=selection.selectedPages[i];
   progress('Checking header response '+(i+1)+' of '+selection.selectedPages.length+'…',
    10+i/selection.selectedPages.length*85);
   try{
    const result=await request('MICIRQL_SECURITY_HEADERS','MICIRQL_SECURITY_HEADERS_RESULT',address,20000);
    observations.push({requestedUrl:address,response:result});
   }catch(error){
    observations.push({requestedUrl:address,response:{ok:false,observed:false,reason:String(error.message||error).slice(0,160)}});
   }
  }
  const result=buildSecurityReport({website:site.href,observations,
   discoveredPages:discovery.ok?selection.discoveredCandidatePages:0,
   discoveryTruncated:discovery.ok?discovery.truncated===true:true});
  render(result);progress('Passive review complete. Print or Save PDF report.',100);
 }catch(error){progress('Review stopped: '+(error.message||error),0)}
 finally{busy=false;button.disabled=!connected}
});
$('pdf').addEventListener('click',()=>{if(latest)window.print()});
try{const incoming=new URLSearchParams(location.search).get('url');if(incoming)urlInput.value=normalize(incoming).href}catch{}
