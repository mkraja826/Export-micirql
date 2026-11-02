const PRESETS={375:812,768:1024,1440:900};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let captureBusy=false;
let seoBusy=false;
let discoveryBusy=false;
let qaLayoutBusy=false;
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
// Retry one interrupted ZIP transfer while the local offscreen Blob URL remains valid.
// A new Chrome download ID is required after an interruption; never mark it complete early.
async function downloadZipWithRetry(url,filename='micirql-screenshots.zip'){
 for(let attempt=0;attempt<2;attempt++){
  const id=await chrome.downloads.download({url,filename,saveAs:false,conflictAction:'uniquify'});
  try{await waitForDownload(id);return}
  catch(error){
   if(attempt===1||!/^Chrome interrupted the screenshot download/.test(error?.message||''))throw error;
   // Preserve the existing download progress while attempting a fresh Chrome transfer.
  }
 }
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
  if(zipMode){await progress(attempted,pages.length*widths.length,'packaging','Creating ZIP…');const archive=await zipMessage('FINISH',{filename:'micirql-screenshots.zip'});await progress(attempted,pages.length*widths.length,'downloading','Saving ZIP in Chrome…');await downloadZipWithRetry(archive.url)}
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
 let limitReached=false;
 const tab=await chrome.tabs.create({url:start,active:false});
 try{
  while(queued.length&&visited.size<60){
   const page=queued.shift();
   try{
    await chrome.tabs.update(tab.id,{url:page});
    await waitForUsableTab(tab.id,page,25000);
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
     if(normalized&&!seen.has(normalized)){
      if(seen.size>=60){limitReached=true;continue}
      seen.add(normalized);queued.push(normalized);
     }
    }
   }catch(error){visited.add(page);errors.push({url:page,message:error.message||'Could not inspect page'})}
   try{await chrome.storage.local.set({seoDiscoveryProgress:{done:visited.size,total:60,found:successful.length,errors:errors.length}})}catch{}
  }
  return {ok:true,pages:successful,scanned:visited.size,errors,truncated:limitReached||queued.length>0};
 }finally{try{await chrome.tabs.remove(tab.id)}catch{}}
}
async function readWebsiteHtml(url){
 const parsed=new URL(url);
 if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Invalid website URL');
 // Attach before navigation to observe the actual response, not a second HTTP request.
 const observe=Boolean(chrome.webRequest?.onHeadersReceived&&chrome.tabs.update);
 const tab=await chrome.tabs.create({url:observe?'about:blank':parsed.href,active:false});
 const httpEvidence={observed:false,status:null,headers:{},redirects:[],observationState:observe?'waiting_for_response':'api_unavailable'};
 let navigationError=null;
 const onNavigationError=details=>{
  if(details.tabId!==tab.id||details.frameId!==0)return;
  // Only Chrome's explicit DNS error can be called DNS failure.
  const error=String(details.error||'');
  navigationError={errorCode:error.slice(0,100),classification:error==='net::ERR_NAME_NOT_RESOLVED'?'dns_resolution_failed':
   error==='net::ERR_DNS_TIMED_OUT'?'dns_timeout':'navigation_failed'};
 };
 const observeNavigation=Boolean(chrome.webNavigation?.onErrorOccurred);
 if(observeNavigation)chrome.webNavigation.onErrorOccurred.addListener(onNavigationError,{url:[{schemes:['http','https']}]});

 const onHeaders=details=>{
  if(details.tabId!==tab.id||details.type!=='main_frame')return;
  httpEvidence.observed=true;
  httpEvidence.observationState='response_observed';
  if(details.statusCode>=300&&details.statusCode<400){
   const location=(details.responseHeaders||[]).find(h=>h.name.toLowerCase()==='location')?.value;
   httpEvidence.redirects.push({url:details.url,status:details.statusCode,location:location?String(location).slice(0,2048):null});
   return;
  }
  httpEvidence.status=details.statusCode;
  const allowed=new Set(['x-robots-tag','link','content-type','location']);
  httpEvidence.headers=Object.fromEntries((details.responseHeaders||[])
   .filter(h=>allowed.has(h.name.toLowerCase()))
   .map(h=>[h.name.toLowerCase(),String(h.value||'').slice(0,2048)]));
 };
 try{
  if(observe){
   chrome.webRequest.onHeadersReceived.addListener(onHeaders,{urls:['http://*/*','https://*/*'],tabId:tab.id},['responseHeaders']);
   await chrome.tabs.update(tab.id,{url:parsed.href});
  }
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
  return {ok:true,url:finalUrl.href,html,partial:value?.partial===true,originalLength:value?.originalLength||html.length,httpEvidence:{...httpEvidence,observationState:httpEvidence.observed?'response_observed':httpEvidence.observationState==='waiting_for_response'?'no_response_event':httpEvidence.observationState,requestedUrl:parsed.href,finalUrl:finalUrl.href}};
 }catch(error){
  // Keep observed HTTP evidence when navigation fails; a failed page has no HTML SEO score.
  const detail=String(error?.message||error||'Navigation failed');
  return {ok:false,error:detail,classification:navigationError?.classification||(/timed out|timeout/i.test(detail)?'navigation_timeout':'navigation_failed'),navigationError,httpEvidence:{...httpEvidence,requestedUrl:parsed.href,finalUrl:null}};
 }finally{if(observe)chrome.webRequest.onHeadersReceived.removeListener(onHeaders);if(observeNavigation)chrome.webNavigation.onErrorOccurred.removeListener(onNavigationError);try{await chrome.tabs.remove(tab.id)}catch{}}
}
// Browser-observed, read-only layout QA: no clicking, form submission or input values.
async function readQaLayout(rawUrl){
 const parsed=new URL(rawUrl);
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Invalid public website URL');
 const tab=await chrome.tabs.create({url:parsed.href,active:false});
 const target={tabId:tab.id};
 let attached=false;
 try{
  await waitForUsableTab(tab.id,parsed.href,30000);
  const loaded=await chrome.tabs.get(tab.id);
  const finalUrl=new URL(loaded.url||'');
  if(!['http:','https:'].includes(finalUrl.protocol)||finalUrl.origin!==parsed.origin)throw Error('QA layout page redirected outside the selected website');
  await chrome.debugger.attach(target,'1.3');attached=true;
  const widths=[375,768,1440],observations=[];
  for(const width of widths){
   try{
    await cdp(target,'Emulation.setDeviceMetricsOverride',{width,height:PRESETS[width],deviceScaleFactor:1,mobile:width===375});
    await wait(320);
    // A page can redirect after the initial load. Revalidate origin before every
    // viewport observation so an unrelated site is never inspected by mistake.
    const current=await chrome.tabs.get(tab.id);
    const currentUrl=new URL(current.url||'');
    if(!['http:','https:'].includes(currentUrl.protocol)||currentUrl.origin!==parsed.origin)
     throw Error('QA layout page navigated outside the selected website');
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
     const root=document.documentElement,body=document.body;
     const viewportWidth=window.innerWidth;
     const deviceScreenWidth=Number(window.screen?.width)||null;
     const hasViewportMeta=Boolean(document.querySelector?.('meta[name="viewport"]'));
     // Without a device-width viewport declaration, Chromium legitimately renders a
     // 375px emulated device using a ~980px CSS layout viewport and scales it down.
     // This is useful QA evidence, not a failed emulation by itself.
     const docWidth=Math.max(root?.scrollWidth||0,body?.scrollWidth||0);
     const controls=[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(el=>el.getClientRects().length>0).slice(0,600);
     // Resolve accessible names conservatively. Empty labels and missing aria-labelledby IDs
     // cannot make a control "named"; never inspect or return input values.
     const hasName=(el,includeContents=true)=>{
      if(String(el.getAttribute('aria-label')||'').trim())return true;
      const ids=String(el.getAttribute('aria-labelledby')||'').trim().split(/\s+/).slice(0,12);
      if(ids.some(id=>id&&String(document.getElementById(id)?.textContent||'').trim()))return true;
      if(String(el.getAttribute('title')||'').trim())return true;
      if(el.labels&&[...el.labels].some(label=>String(label.textContent||'').trim()))return true;
      if(!includeContents)return false;
      if(String(el.textContent||'').trim())return true;
      if(el.querySelector('img[alt]:not([alt=""])'))return true;
      return Boolean(el.querySelector('svg title')?.textContent?.trim());
     };
     const labelled=el=>hasName(el,false);
     // Read-only DOM evidence: do not click, follow links, edit fields, validate or submit forms.
     // Return aggregate counts only; no URL destinations, field values or private page text.
     const navLinks=[...document.querySelectorAll('nav a,[role="navigation"] a')].filter(el=>el.getClientRects().length>0).slice(0,500);
     const linksWithoutNames=navLinks.filter(el=>!hasName(el));
     const navHref=el=>String(el.getAttribute('href')||'').trim();
     const placeholderNavLinks=navLinks.filter(el=>!navHref(el)||navHref(el)==='#').length;
     const scriptedNavLinks=navLinks.filter(el=>/^(?:javascript|data|vbscript):/i.test(navHref(el))).length;
     const missingFragmentTargets=navLinks.filter(el=>{
      const href=navHref(el);
      if(!href.startsWith('#')||href==='#')return false;
      let fragment=href.slice(1);
      try{fragment=decodeURIComponent(fragment)}catch{return false}
      return Boolean(fragment&&!document.getElementById(fragment));
     }).length;
     const implicitSubmitButtons=[...document.forms].slice(0,100).reduce((sum,form)=>
      sum+[...form.querySelectorAll('button:not([type])')].filter(el=>el.getClientRects().length>0).length,0);
     // Inspect only visible/enabled elements. Check structure and dimensions, never invoke handlers.
     const visibleButtons=[...document.querySelectorAll('button')].filter(el=>el.getClientRects().length>0&&!el.disabled).slice(0,500);
     const buttonsWithoutNames=visibleButtons.filter(el=>!hasName(el)).length;
     const customInteractive=[...document.querySelectorAll('[role="button"],[role="link"]')]
      .filter(el=>el.getClientRects().length>0&&el.getAttribute('aria-disabled')!=='true').slice(0,500);
     const customControlsWithoutTabFocus=customInteractive.filter(el=>typeof el.tabIndex==='number'&&el.tabIndex<0).length;
     const navigationWithoutTabFocus=navLinks.filter(el=>el.getAttribute('aria-disabled')!=='true'
      &&typeof el.tabIndex==='number'&&el.tabIndex<0).length;
     // Small targets can have spacing or inline-text exceptions: report only as a review count.
     const smallNavigationTargets=navLinks.filter(el=>{
      if(typeof el.getBoundingClientRect!=='function')return false;
      const rect=el.getBoundingClientRect();
      return Boolean(rect&&rect.width>0&&rect.height>0&&(rect.width<24||rect.height<24));
     }).length;
     const requiredFieldsWithoutLabels=controls.filter(el=>el.required&&!labelled(el)).length;
     return {observedWidth:viewportWidth,deviceScreenWidth,hasViewportMeta,
      documentWidth:docWidth,horizontalOverflowPx:Math.max(0,docWidth-viewportWidth),
      formCount:document.forms.length,visibleFormControls:controls.length,unlabelledVisibleFields:controls.filter(el=>!labelled(el)).length,
      requiredVisibleFields:controls.filter(el=>el.required).length,navigationLinks:navLinks.length,unnamedNavigationLinks:linksWithoutNames.length,
      placeholderNavigationLinks:placeholderNavLinks,scriptedNavigationLinks:scriptedNavLinks,missingNavigationFragmentTargets:missingFragmentTargets,
      implicitSubmitButtons,visibleButtons:visibleButtons.length,buttonsWithoutNames,customInteractiveControls:customInteractive.length,
      customControlsWithoutTabFocus,navigationWithoutTabFocus,smallNavigationTargets,requiredFieldsWithoutLabels};
    }});
    const metrics=results?.[0]?.result;
    if(!metrics||!Number.isFinite(metrics.observedWidth))throw Error('Chrome did not return a CSS layout viewport');
    const deviceConfirmed=width===375&&Number.isFinite(metrics.deviceScreenWidth)
     &&Math.abs(metrics.deviceScreenWidth-width)<=4;
    const layoutConfirmed=Math.abs(metrics.observedWidth-width)<=4;
    if(!deviceConfirmed&&!layoutConfirmed)throw Error('Chrome did not confirm the requested emulated device width');
    // Report the scaled layout explicitly. An absence of horizontal overflow
    // against a 980px CSS viewport does NOT mean the mobile page is responsive.
    observations.push({width,verified:true,...metrics,
     scaledMobileLayout:width===375&&deviceConfirmed&&metrics.observedWidth>width+4,
     missingMobileViewportMeta:width===375&&metrics.hasViewportMeta===false});
   }catch(error){
    observations.push({width,verified:false,reason:String(error?.message||'Viewport observation failed').slice(0,170)});
   }
  }
  return {ok:true,url:finalUrl.href,scope:'one_page_three_viewports',interactionTesting:false,observations};
 }catch(error){return {ok:false,error:String(error?.message||'Browser layout observation failed')}}
 finally{
  if(attached){try{await cdp(target,'Emulation.clearDeviceMetricsOverride')}catch{}try{await chrome.debugger.detach(target)}catch{}}
  try{await chrome.tabs.remove(tab.id)}catch{}
 }
}
async function checkSeoLinkStatus(rawUrl){
 const target=new URL(rawUrl);
 if(!['https:','http:'].includes(target.protocol))throw Error('Only HTTP(S) URLs may be checked');
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  // GET is used because some production websites reject HEAD; never read the response body.
  const response=await fetch(target.href,{method:'GET',redirect:'follow',credentials:'omit',cache:'no-store',signal:controller.signal});
  try{await response.body?.cancel()}catch{}
  const status=response.status;
  return {ok:true,url:target.href,finalUrl:response.url,status,classification:status===404||status===410?'broken':status>=500?'server_error':status>=200&&status<400?'reachable':'unverified'};
 }catch(error){return {ok:true,url:target.href,status:null,classification:'unverified',reason:error.name==='AbortError'?'timeout':'request_failed'}}
 finally{clearTimeout(timeout)}
}
// Read-only robots.txt request on the audited origin. Redirects remain unverified.
async function readRobotsTxt(rawUrl){
 const website=new URL(rawUrl);
 if(!['https:','http:'].includes(website.protocol)||website.username||website.password)throw Error('Invalid public website URL');
 const target=new URL('/robots.txt',website.origin);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(target.href,{method:'GET',credentials:'omit',redirect:'manual',cache:'no-store',signal:controller.signal});
  const status=response.status;
  const result={ok:true,observed:true,url:target.href,status,body:null,truncated:false};
  if(status===200){
   const type=response.headers.get('content-type')||'';
   if(type&&!/text\/plain|text\/html|application\/octet-stream/i.test(type))
    return {...result,truncated:true,reason:'unexpected_content_type'};
   const length=Number(response.headers.get('content-length'));
   if(Number.isFinite(length)&&length>500000)return {...result,truncated:true,reason:'body_too_large'};
   const reader=response.body?.getReader();
   if(!reader)return {...result,truncated:true,reason:'body_unavailable'};
   const chunks=[];let total=0;
   while(true){const next=await reader.read();if(next.done)break;total+=next.value.length;
    if(total>500000){await reader.cancel();return {...result,truncated:true,reason:'body_too_large'}}
    chunks.push(next.value);
   }
   const bytes=new Uint8Array(total);let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   result.body=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
  }
  return result;
 }catch(error){return {ok:true,observed:false,status:null,url:target.href,
  reason:error?.name==='AbortError'?'timeout':'network_unverified'}}
 finally{clearTimeout(timer)}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id)return false;
 // The first-party site bridge can request page inspection; reject other web-tab senders.
 const trustedOrigins=new Set(['https://tools.micirql.com','https://export.micirql.com']);
 if(sender.tab){let senderOrigin;try{senderOrigin=new URL(sender.url||sender.tab.url).origin}catch{return false}if(!trustedOrigins.has(senderOrigin))return false;}
 if(message?.type==='DISCOVER_SUBPAGE'){
  if(discoveryBusy){sendResponse({ok:false,error:'Another page discovery is already running. Finish it before starting a new one.'});return false;}
  discoveryBusy=true;
  discoverLocalSubpage(message.url).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Discovery failed'})).finally(()=>{discoveryBusy=false});
  return true;
 }
 if(message?.type==='READ_QA_LAYOUT'){
  if(qaLayoutBusy){sendResponse({ok:false,error:'Another browser QA layout scan is already running.'});return false;}
  qaLayoutBusy=true;
  readQaLayout(message.url).then(sendResponse).catch(error=>sendResponse({ok:false,error:String(error?.message||'Layout inspection failed')})).finally(()=>{qaLayoutBusy=false});
  return true;
 }
 if(message?.type==='CHECK_SEO_LINK'){
  checkSeoLinkStatus(message.url).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Invalid URL'}));
  return true;
 }
 if(message?.type==='READ_SEO_ROBOTS'){
  readRobotsTxt(message.url).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Robots request failed'}));
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
