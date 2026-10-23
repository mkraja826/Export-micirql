const PRESETS={375:812,768:1024,1440:900};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let captureBusy=false;
let seoBusy=false;
async function progress(done,total,state='capturing',message=''){await chrome.storage.local.set({captureProgress:{percent:state==='complete'?100:Math.round(done/Math.max(1,total)*95),done,total,state,message}})}
async function zipMessage(action,extra={}){const response=await chrome.runtime.sendMessage({target:'ZIP_OFFSCREEN',action,...extra});if(!response?.ok)throw Error(response?.error||'ZIP operation failed');return response}
async function ensureZipDocument(){const url=chrome.runtime.getURL('offscreen.html');const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]});if(!contexts.length)await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['BLOBS'],justification:'Create screenshot ZIP files entirely on the user device.'})}
async function cdp(target,method,params={}){return chrome.debugger.sendCommand(target,method,params)}
async function waitForDownload(downloadId,timeout=180000){
 if(!Number.isInteger(downloadId))throw Error('Chrome did not accept the download');
 return new Promise((resolve,reject)=>{
  let finished=false;
  const cleanup=()=>{clearTimeout(timer);chrome.downloads.onChanged.removeListener(onChange)};
  const finish=error=>{if(finished)return;finished=true;cleanup();error?reject(error):resolve()};
  const onChange=change=>{
   if(change.id!==downloadId)return;
   if(change.state?.current==='complete')finish();
   else if(change.state?.current==='interrupted')finish(Error('Chrome interrupted the screenshot download'+(change.error?.current?': '+change.error.current:'')));
  };
  const timer=setTimeout(()=>finish(Error('Chrome download confirmation timed out')),timeout);
  chrome.downloads.onChanged.addListener(onChange);
  chrome.downloads.search({id:downloadId}).then(items=>{
   if(finished)return;
   const state=items?.[0]?.state;
   if(state==='complete')finish();
   else if(state==='interrupted')finish(Error('Chrome interrupted the screenshot download'));
  }).catch(finish);
 });
}
async function waitForTab(tabId,timeout=45000){return new Promise((resolve,reject)=>{let done=false;const cleanup=()=>{chrome.tabs.onUpdated.removeListener(onUpdate);clearTimeout(timer)};const finish=error=>{if(done)return;done=true;cleanup();error?reject(error):resolve()};const onUpdate=(id,change)=>{if(id===tabId&&change.status==='complete')finish()};const timer=setTimeout(()=>finish(Error('Page load timed out')),timeout);chrome.tabs.onUpdated.addListener(onUpdate);chrome.tabs.get(tabId).then(tab=>{if(tab.status==='complete')finish()}).catch(finish)})}
// Scroll the current viewport to activate intersection observers, deferred images and reveal animations.
// Keep the warm-up bounded: very long and infinite-scroll sites must not hang a batch.
async function warmUpPage(target,viewportHeight){
 const expression=`(async()=>{
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const doc=document.documentElement;
  const height=()=>Math.max(doc?.scrollHeight||0,document.body?.scrollHeight||0);
  const step=Math.max(320,Math.floor(${viewportHeight}*0.75));
  const originalBehavior=doc.style.scrollBehavior;
  const originalScrollY=window.scrollY;
  const images=[...document.images].slice(0,240);
  // This temporary capture tab requests eager downloads of images below the fold.
  const previousLoading=images.map(image=>image.getAttribute('loading'));
  let steps=0;
  doc.style.scrollBehavior='auto';
  try{
   images.forEach(image=>image.loading='eager');
   // Two bounded sweeps trigger lazy content populated during the first pass.
   for(let pass=0;pass<2;pass++){
    // Spread the bounded warm-up across the entire document so images near
    // the bottom of long pages get a chance to load before segmented capture.
    const end=Math.min(Math.max(0,height()-innerHeight),480000);
    const stride=Math.max(step,Math.ceil(end/47));
    for(let i=0;i<48&&steps<96;i++,steps++){
     const y=Math.min(end,i*stride);
     window.scrollTo(0,y);
     await sleep(170);
     if(y===end)break;
    }
    window.scrollTo(0,end);
    await sleep(320);
   }
   const visibleImages=images.filter(image=>image.getBoundingClientRect().width>0);
   await Promise.race([
    Promise.all(visibleImages.map(image=>image.decode?.().catch(()=>{})||Promise.resolve())),
    sleep(3500)
   ]);
   if(document.fonts?.ready)await Promise.race([document.fonts.ready,sleep(1800)]);
   // Finish finite running reveal effects, but leave perpetual UI animations alone.
   for(const animation of document.getAnimations?.()||[]){
    try{
     const timing=animation.effect?.getComputedTiming?.();
     if(animation.playState==='running'&&Number.isFinite(timing?.endTime)&&timing.endTime<=8000)animation.finish();
    }catch{}
   }
  }finally{
   images.forEach((image,i)=>{
    if(previousLoading[i]===null)image.removeAttribute('loading');
    else image.setAttribute('loading',previousLoading[i]);
   });
   window.scrollTo(0,originalScrollY);
   doc.style.scrollBehavior=originalBehavior;
  }
  await sleep(500);
  return {steps,images:images.length};
 })()`;
 const result=await cdp(target,'Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(result?.exceptionDetails)throw Error('Page preparation JavaScript failed');
}
// A timeout can mean the load event never fired despite a usable document.
// Confirm both the intended origin and DOM readiness before proceeding.
async function waitForUsableTab(tabId,url,timeout=30000){
 try{await waitForTab(tabId,timeout)}
 catch(error){
  const tab=await chrome.tabs.get(tabId);
  let requested,actual;
  try{requested=new URL(url);actual=new URL(tab.url||'')}catch{throw error}
  if(actual.origin!==requested.origin)throw error;
  const ready=await chrome.scripting.executeScript({target:{tabId},func:()=>document.readyState});
  if(!['interactive','complete'].includes(ready?.[0]?.result))throw error;
 }
}
async function capture(url,widths,format,subpage='',returnImages=false,selectedPages=null,zipMode=false){
 const parsed=new URL(url);
 if(!['http:','https:'].includes(parsed.protocol))throw Error('Enter an HTTP(S) website URL.');
 if(parsed.username||parsed.password)throw Error('URLs with embedded credentials are not supported.');
 if(!Array.isArray(widths)||!widths.length||widths.length>3||new Set(widths).size!==widths.length||widths.some(w=>!Object.hasOwn(PRESETS,w))||!['jpeg','png'].includes(format))throw Error('Invalid capture settings.');
 let pages=[parsed];if(Array.isArray(selectedPages)){if(selectedPages.length>60)throw Error('Select no more than 60 pages per batch.');pages=[...new Set(selectedPages)].map(value=>new URL(value)).filter(page=>page.origin===parsed.origin&&['http:','https:'].includes(page.protocol)&&!page.username&&!page.password);if(!pages.length)throw Error('No valid pages selected.');}else if(subpage){const second=new URL(subpage);if(!['http:','https:'].includes(second.protocol)||second.origin!==parsed.origin)throw Error('Subpage must be on the same website.');if(second.href!==parsed.href)pages.push(second);}
 if(zipMode){await ensureZipDocument();await zipMessage('START')}
 await progress(0,pages.length*widths.length);
 const tab=await chrome.tabs.create({url:parsed.href,active:false});
 const target={tabId:tab.id};let attached=false,count=0,attempted=0;const images=[],errors=[],warnings=[];
 try{
  await waitForUsableTab(tab.id,parsed.href);
  await chrome.debugger.attach(target,'1.3');attached=true;
  await cdp(target,'Page.enable');
  let currentUrl=parsed.href;
  for(const page of pages){
   try{
    if(page.href!==currentUrl){
     await chrome.tabs.update(tab.id,{url:page.href});
     // Sites with persistent analytics or loading requests sometimes never emit
     // complete; a timeout is recoverable only if the target document has loaded.
     await waitForUsableTab(tab.id,page.href);
     await wait(1200);currentUrl=page.href;
    }
    const loaded=await chrome.tabs.get(tab.id);
    let loadedUrl;
    try{loadedUrl=new URL(loaded.url||'')}catch{throw Error('Could not verify the loaded page URL')}
    if(!['http:','https:'].includes(loadedUrl.protocol)||loadedUrl.origin!==parsed.origin)throw Error('A page redirected outside the selected website: '+page.pathname);
   }catch(error){
    for(const width of widths){errors.push({url:page.href,width,error:error?.message||'Page navigation failed'});attempted++}
    await progress(attempted,pages.length*widths.length,'capturing','Skipping page after navigation failure');
    continue;
   }
  for(const width of widths){
   try{
    await cdp(target,'Emulation.setDeviceMetricsOverride',{width,height:PRESETS[width],deviceScaleFactor:1,mobile:width===375});
    await wait(350);
    await warmUpPage(target,PRESETS[width]);
    await wait(180);
    // Advisory only: a successful image export may still contain unloaded assets.
    // Never inspect image URLs or transfer page content into the warning report.
    try{
     const check=await cdp(target,'Runtime.evaluate',{expression:"(()=>({pending:[...document.images].filter(i=>!i.complete).length,broken:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).length}))()",returnByValue:true});
     const quality=check?.result?.value;
     if(quality&&Number.isInteger(quality.pending)&&Number.isInteger(quality.broken)&&(quality.pending||quality.broken)){
      warnings.push({url:page.href,width,pendingImages:quality.pending,brokenImages:quality.broken,message:'Potentially incomplete images'});
     }
    }catch{}
    const metrics=await cdp(target,'Page.getLayoutMetrics');
    const fullHeight=Math.ceil(metrics.cssContentSize?.height||PRESETS[width]);
    if(!Number.isFinite(fullHeight)||fullHeight<1)throw Error('Invalid page height returned by Chrome');
    // Segment tall pages into bounded screenshots rather than failing the whole page.
    // Each segment is a separate numbered image, not an inaccurately stitched image.
    const maxSegment=12000;
    const segments=Math.ceil(Math.max(PRESETS[width],fullHeight)/maxSegment);
    if(segments>40)throw Error('Page is too tall for a bounded local export (over 480,000px)');
    const slug=page.pathname.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'home';
    for(let part=0;part<segments;part++){
     const y=part*maxSegment;
     const height=Math.min(maxSegment,Math.max(PRESETS[width],fullHeight)-y);
     let result;
     for(let retry=0;retry<3;retry++){
      try{
       result=await cdp(target,'Page.captureScreenshot',{format,quality:format==='jpeg'?85:undefined,captureBeyondViewport:true,fromSurface:true,clip:{x:0,y,width,height,scale:1}});
       if(!result?.data)throw Error('Chrome returned an empty screenshot');
       break;
      }catch(error){
       if(retry===2)throw error;
       await wait(500*(retry+1));
      }
     }
     const filename='micirql/'+parsed.hostname+'-'+slug+'-'+pages.indexOf(page)+'-'+width+'px'+(segments>1?'-part-'+String(part+1).padStart(3,'0')+'-of-'+segments:'')+'.'+(format==='jpeg'?'jpg':'png');
     if(zipMode){await zipMessage('ADD',{name:filename.split('/').pop(),data:result.data})}
     else if(returnImages){images.push({name:filename.split('/').pop(),data:result.data,mime:'image/'+format})}
     else{const downloadId=await chrome.downloads.download({url:'data:image/'+format+';base64,'+result.data,filename,saveAs:false,conflictAction:'uniquify'});await waitForDownload(downloadId)}
     count++;
    }
   }catch(error){
    errors.push({url:page.href,width,error:error?.message||'Screenshot failed'});
   }finally{
    attempted++;
    await progress(attempted,pages.length*widths.length,'capturing',errors.length?errors.length+' capture(s) failed; continuing…':'');
   }
  }
  }
  if(!count)throw Error('No screenshots succeeded: '+(errors[0]?.error||'Capture failed'));
  if(zipMode){await progress(attempted,pages.length*widths.length,'packaging','Creating ZIP…');const archive=await zipMessage('FINISH',{filename:'micirql-screenshots.zip'});const id=await chrome.downloads.download({url:archive.url,filename:'micirql-screenshots.zip',saveAs:false,conflictAction:'uniquify'});await progress(attempted,pages.length*widths.length,'downloading','Saving ZIP in Chrome…');await waitForDownload(id)}
  await progress(attempted,pages.length*widths.length,'complete',errors.length?count+' saved, '+errors.length+' failed':zipMode?'ZIP download completed':returnImages?'Capture completed':'Image downloads completed');
  return {ok:true,count,images,errors,warnings};
 }finally{
  if(attached){try{await cdp(target,'Emulation.clearDeviceMetricsOverride')}catch{}try{await chrome.debugger.detach(target)}catch{}}
  try{await chrome.tabs.remove(tab.id)}catch{}
 }
}
async function discoverLocalSubpage(url){
 const parsed=new URL(url);
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Invalid website URL');
 const normalize=value=>{try{const u=new URL(value,parsed.href);if(u.origin!==parsed.origin||!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.hash='';u.search='';if(/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|woff2?|css|js)$/i.test(u.pathname))return null;return u.href}catch{return null}};
 const start=normalize(parsed.href);
 if(!start)throw Error('Invalid starting page');
 const queued=[start],seen=new Set([start]),visited=new Set(),successful=[],errors=[];
 const tab=await chrome.tabs.create({url:start,active:false});
 try{
  while(queued.length&&visited.size<60){
   const page=queued.shift();
   try{
    await chrome.tabs.update(tab.id,{url:page});
    await waitForTab(tab.id,25000);
    await wait(300);
    const loaded=await chrome.tabs.get(tab.id);
    let finalUrl;
    try{finalUrl=new URL(loaded.url||'')}catch{throw Error('Could not verify the discovered page URL')}
    if(finalUrl.origin!==parsed.origin||!['http:','https:'].includes(finalUrl.protocol)){
     throw Error('Discovery skipped a page redirected outside the selected website');
    }
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>[...document.querySelectorAll('a[href]')].map(a=>a.href).slice(0,500)});
    visited.add(page);
    successful.push(page);
    for(const value of results[0]?.result||[]){
     const normalized=normalize(value);
     if(normalized&&!seen.has(normalized)&&seen.size<60){seen.add(normalized);queued.push(normalized)}
    }
   }catch(error){visited.add(page);errors.push({url:page,message:error.message||'Could not inspect page'})}
  }
  return {ok:true,pages:successful,scanned:visited.size,errors,truncated:queued.length>0};
 }finally{try{await chrome.tabs.remove(tab.id)}catch{}}
}
async function readWebsiteHtml(url){
 const parsed=new URL(url);
 if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Invalid website URL');
 const tab=await chrome.tabs.create({url:parsed.href,active:false});
 try{
  await waitForTab(tab.id);
  const loaded=await chrome.tabs.get(tab.id);
  const finalUrl=new URL(loaded.url||'');
  if(!['http:','https:'].includes(finalUrl.protocol)||finalUrl.origin!==parsed.origin){
   throw Error('Website redirected to a different origin. Inspect the final URL separately.');
  }
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   const markup=document.documentElement?.outerHTML||'';
   if(markup.length<=900000)return {partial:false,html:markup};
   // Large DOM fallback: preserve SEO-critical elements without shipping all page content.
   const esc=value=>String(value||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
   const head=document.head?.outerHTML.slice(0,220000)||'<head></head>';
   const title=document.title||'';
   const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].slice(0,300).map(el=>'<'+el.tagName.toLowerCase()+'>'+esc(el.textContent?.slice(0,500))+'</'+el.tagName.toLowerCase()+'>').join('');
   const imgs=[...document.querySelectorAll('img')].slice(0,600).map(el=>'<img src="'+esc(el.getAttribute('src')||'')+'"'+(el.hasAttribute('alt')?' alt="'+esc(el.getAttribute('alt'))+'"':'')+'>').join('');
   const lang=esc(document.documentElement.lang);
   return {partial:true,originalLength:markup.length,html:('<html lang="'+lang+'">'+head.slice(0,220000)+'<body>'+headings+imgs+'</body></html>').slice(0,850000)};
  }});
  const value=results[0]?.result;
  const html=value?.html||'';
  if(!html.trim())throw Error('No HTML was returned. The page may block extension access.');
  return {ok:true,url:finalUrl.href,html,partial:value?.partial===true,originalLength:value?.originalLength||html.length};
 }finally{try{await chrome.tabs.remove(tab.id)}catch{}}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id)return false;
 // The first-party site bridge can request page inspection; reject other web-tab senders.
 const trustedOrigins=new Set(['https://tools.micirql.com','https://export.micirql.com']);
 if(sender.tab){let senderOrigin;try{senderOrigin=new URL(sender.url||sender.tab.url).origin}catch{return false}if(!trustedOrigins.has(senderOrigin))return false;}
 if(message?.type==='DISCOVER_SUBPAGE'){
  discoverLocalSubpage(message.url).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Discovery failed'}));
  return true;
 }
 if(message?.type==='READ_SEO_HTML'){
  if(seoBusy){sendResponse({ok:false,error:'An HTML inspection is already running. Retry after it finishes.'});return false;}
  seoBusy=true;
  readWebsiteHtml(message.url).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Inspection failed'})).finally(()=>{seoBusy=false});
  return true;
 }
 if(message?.type!=='CAPTURE')return false;
 if(captureBusy){sendResponse({ok:false,error:'A capture is already running. Please wait.'});return false;}
 captureBusy=true;
 capture(message.url,message.widths,message.format,message.subpage,!!message.returnImages,message.pages,!!message.zip).then(sendResponse).catch(async error=>{await chrome.storage.local.set({captureProgress:{state:'error',percent:0,message:error.message||'Capture failed'}});sendResponse({ok:false,error:error.message||'Capture failed'})}).finally(()=>{captureBusy=false});
 return true;
});
