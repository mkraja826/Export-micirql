const $=selector=>document.querySelector(selector);
const status=$('#status'),extensionStatus=$('#extension-status'),progress=$('#progress'),percentage=$('#percentage');
let connected=false,outdated=false,activeRequest=null,allPages=[],captureUrl='';
const MAX_QUICK_PIXELS=24_000_000;

const bridge=(type,details={})=>window.postMessage({source:'micirql-web',type,...details},location.origin);
const setStatus=(message)=>{status.textContent=message};
const inputUrl=()=>{const value=$('#url').value.trim();const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Enter a valid HTTP(S) URL without credentials.');return url.href};
function selectTab(name){for(const button of document.querySelectorAll('[data-tab]'))button.setAttribute('aria-selected',String(button.dataset.tab===name));for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel!==name;$('#capture-config').hidden=name==='quick';$('#bulk-controls').hidden=name!=='bulk';$('#start').textContent=name==='bulk'?'Capture selected pages & download ZIP':'Capture full page & download';}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab)));
function renderConnection(){extensionStatus.textContent=connected?'Extension connected — captures run locally.':outdated?'Your MiCirql extension is outdated. Install the latest version and refresh this page.':'Extension not detected. Install it for full-page and bulk screenshots.';extensionStatus.dataset.ready=String(connected);$('#discover').disabled=!connected;$('#start').disabled=!connected}
function request(type,details){if(!connected)throw Error('Install the MiCirql Chrome extension and refresh this page before running local discovery or capture.');if(activeRequest)throw Error('An extension operation is already running.');const id='micirql-'+Date.now()+'-'+Math.random().toString(36).slice(2);activeRequest={id,type};bridge(type,{id,...details});return id}
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.source!=='micirql-extension')return;
 const data=event.data;
 if(data.type==='MICIRQL_EXTENSION_READY'){connected=data.protocol===2&&Array.isArray(data.capabilities)&&['discover','capture','bulk','progress'].every(cap=>data.capabilities.includes(cap));outdated=!connected;renderConnection();return}
 if(data.type==='MICIRQL_CAPTURE_PROGRESS'&&activeRequest&&data.id===activeRequest.id){const value=Math.max(0,Math.min(100,Number(data.percent)||0));progress.value=value;percentage.textContent=value+'%';setStatus(data.message||'Capturing '+(data.done||0)+' of '+(data.total||0)+'…');return}
 if(!activeRequest||data.id!==activeRequest.id)return;
 if((data.type==='MICIRQL_CAPTURE_RESULT'&&activeRequest.type==='MICIRQL_CAPTURE')||(data.type==='MICIRQL_DISCOVER_RESULT'&&activeRequest.type==='MICIRQL_DISCOVER')){
  const operation=activeRequest.type;activeRequest=null;$('#start').disabled=!connected;$('#discover').disabled=!connected;
  if(!data.ok){setStatus(data.error||'Operation failed.');return}
  if(operation==='MICIRQL_DISCOVER'){allPages=(data.pages||[]).slice(0,60);renderPages();const skipped=Array.isArray(data.errors)?data.errors.length:0;setStatus(allPages.length?'Discovered '+allPages.length+' verified pages'+(skipped?' ('+skipped+' skipped after load errors or redirects)':'')+'. Choose the ones to capture.':'No capturable pages were found.'+(skipped?' '+skipped+' page(s) failed to load or redirected away.':''));}
  else{progress.value=100;percentage.textContent='100%';setStatus('Capture complete: '+data.count+' screenshot(s). '+(data.zip?'ZIP download completed.':'Image download started.'))}
 }
});
function renderPages(){const area=$('#pages');area.replaceChildren();for(const [index,url] of allPages.entries()){const label=document.createElement('label');label.className='page';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='page-check';checkbox.value=url;checkbox.checked=true;const span=document.createElement('span');span.textContent=new URL(url).pathname||'/';label.append(checkbox,span);area.append(label)}$('#page-count').textContent=allPages.length+' pages found'}
$('#url').addEventListener('input',()=>{if($('#url').value.trim()!==captureUrl){allPages=[];renderPages()}});
$('#discover').addEventListener('click',()=>{
 try{if(!connected)throw Error('Install the free MiCirql extension to discover all website pages.');const url=inputUrl();captureUrl=url;$('#discover').disabled=true;setStatus('Discovering pages in your browser…');request('MICIRQL_DISCOVER',{url})}
 catch(error){$('#discover').disabled=!connected;setStatus(error.message)}
});
$('#start').addEventListener('click',()=>{
 try{
  if(!connected)throw Error('Install and reload the MiCirql extension to enable full-page capture.');
  const url=inputUrl(),mode=document.querySelector('[data-tab][aria-selected="true"]').dataset.tab;
  const selected=mode==='bulk'?[...document.querySelectorAll('.page-check:checked')].map(el=>el.value):[url];
  if(!selected.length)throw Error('Select at least one page.');
  const selectedWidths=[...document.querySelectorAll('[name=width]:checked')].map(el=>Number(el.value));
  if(!selectedWidths.length)throw Error('Select at least one viewport.');
  const format=$('#format').value;
  const zip=mode==='bulk';
  $('#start').disabled=true;progress.value=0;percentage.textContent='0%';setStatus('Starting local capture…');
  request('MICIRQL_CAPTURE',{url,pages:selected,widths:selectedWidths,format,zip});
 }catch(error){$('#start').disabled=!connected;setStatus(error.message)}
});
$('#quick').addEventListener('click',async()=>{
 let stream;
 try{
  if(!navigator.mediaDevices?.getDisplayMedia)throw Error('Screen sharing is unavailable in this browser. Use desktop Chrome or Edge over HTTPS.');
  $('#quick').disabled=true;
  setStatus('Choose the browser tab to capture in the sharing dialog.');
  stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false});
  const track=stream.getVideoTracks()[0],settings=track.getSettings();
  if(settings.displaySurface&&settings.displaySurface!=='browser')throw Error('Select a browser tab, not a window or the entire screen.');
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
  await Promise.race([
   (async()=>{await video.play();if(video.readyState<2)await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Selected tab video failed to load'));});})(),
   new Promise((_,reject)=>setTimeout(()=>reject(Error('The selected tab did not provide a video frame in time.')),10000))
  ]);
  if(track.readyState==='ended')throw Error('Tab sharing stopped before capture.');
  if(!video.videoWidth||!video.videoHeight)throw Error('The selected tab has not provided an image.');
  if(video.videoWidth*video.videoHeight>MAX_QUICK_PIXELS)throw Error('The selected tab resolution is too large to capture safely.');
  // Allow a rendered frame to arrive after metadata, avoiding empty first-frame screenshots.
  if(video.requestVideoFrameCallback)await Promise.race([
   new Promise(resolve=>video.requestVideoFrameCallback(()=>resolve())),
   new Promise(resolve=>setTimeout(resolve,500))
  ]);
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const context=canvas.getContext('2d');if(!context)throw Error('Canvas capture is unavailable.');
  context.drawImage(video,0,0);
  const mime=$('#quick-format').value==='png'?'image/png':'image/jpeg';
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,.88));if(!blob)throw Error('Unable to encode screenshot.');
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='micirql-visible-tab-'+Date.now()+'.'+(mime==='image/png'?'png':'jpg');document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  setStatus('Visible tab screenshot downloaded. For complete scrolling pages, use Full Page Capture.');
 }catch(error){setStatus(error.message||'Quick Capture failed.')}finally{stream?.getTracks().forEach(track=>track.stop());$('#quick').disabled=false}
});
$('#select-all').addEventListener('click',()=>document.querySelectorAll('.page-check').forEach(el=>el.checked=true));
$('#select-none').addEventListener('click',()=>document.querySelectorAll('.page-check').forEach(el=>el.checked=false));
$('#install').addEventListener('click',()=>window.open('https://github.com/mkraja826/Export-micirql/actions/workflows/verify.yml','_blank','noopener'));
const presetUrl=new URLSearchParams(location.search).get('url');if(presetUrl){try{$('#url').value=new URL(presetUrl).href}catch{}}
renderConnection();selectTab('quick');bridge('MICIRQL_EXTENSION_PING');
