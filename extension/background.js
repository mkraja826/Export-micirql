const PRESETS={375:812,768:1024,1440:900};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let captureBusy=false;
async function progress(done,total,state='capturing',message=''){await chrome.storage.local.set({captureProgress:{percent:state==='complete'?100:Math.round(done/Math.max(1,total)*95),done,total,state,message}})}
async function zipMessage(action,extra={}){const response=await chrome.runtime.sendMessage({target:'ZIP_OFFSCREEN',action,...extra});if(!response?.ok)throw Error(response?.error||'ZIP operation failed');return response}
async function ensureZipDocument(){const url=chrome.runtime.getURL('offscreen.html');const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]});if(!contexts.length)await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['BLOBS'],justification:'Create screenshot ZIP files entirely on the user device.'})}
async function cdp(target,method,params={}){return chrome.debugger.sendCommand(target,method,params)}
async function waitForTab(tabId,timeout=45000){return new Promise((resolve,reject)=>{let done=false;const cleanup=()=>{chrome.tabs.onUpdated.removeListener(onUpdate);clearTimeout(timer)};const finish=error=>{if(done)return;done=true;cleanup();error?reject(error):resolve()};const onUpdate=(id,change)=>{if(id===tabId&&change.status==='complete')finish()};const timer=setTimeout(()=>finish(Error('Page load timed out')),timeout);chrome.tabs.onUpdated.addListener(onUpdate);chrome.tabs.get(tabId).then(tab=>{if(tab.status==='complete')finish()}).catch(finish)})}
async function capture(url,widths,format,subpage='',returnImages=false,selectedPages=null,zipMode=false){
 const parsed=new URL(url);
 if(!['http:','https:'].includes(parsed.protocol))throw Error('Enter an HTTP(S) website URL.');
 if(parsed.username||parsed.password)throw Error('URLs with embedded credentials are not supported.');
 if(!Array.isArray(widths)||!widths.length||widths.length>3||new Set(widths).size!==widths.length||widths.some(w=>!Object.hasOwn(PRESETS,w))||!['jpeg','png'].includes(format))throw Error('Invalid capture settings.');
 let pages=[parsed];if(Array.isArray(selectedPages)){if(selectedPages.length>60)throw Error('Select no more than 60 pages per batch.');pages=[...new Set(selectedPages)].map(value=>new URL(value)).filter(page=>page.origin===parsed.origin&&['http:','https:'].includes(page.protocol)&&!page.username&&!page.password);if(!pages.length)throw Error('No valid pages selected.');}else if(subpage){const second=new URL(subpage);if(!['http:','https:'].includes(second.protocol)||second.origin!==parsed.origin)throw Error('Subpage must be on the same website.');if(second.href!==parsed.href)pages.push(second);}
 if(zipMode){await ensureZipDocument();await zipMessage('START')}
 await progress(0,pages.length*widths.length);
 const tab=await chrome.tabs.create({url:parsed.href,active:false});
 const target={tabId:tab.id};let attached=false,count=0;const images=[];
 try{
  await waitForTab(tab.id);
  await chrome.debugger.attach(target,'1.3');attached=true;
  await cdp(target,'Page.enable');
  let currentUrl=parsed.href;
  for(const page of pages){
   if(page.href!==currentUrl){await chrome.tabs.update(tab.id,{url:page.href});await waitForTab(tab.id);await wait(1200);currentUrl=page.href;}
  for(const width of widths){
   await cdp(target,'Emulation.setDeviceMetricsOverride',{width,height:PRESETS[width],deviceScaleFactor:1,mobile:width===375});
   await wait(350);
   // Let browser layout and web fonts settle at each viewport before measuring.
   await cdp(target,'Runtime.evaluate',{expression:'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',awaitPromise:true,returnByValue:true});
   await cdp(target,'Runtime.evaluate',{expression:'window.scrollTo(0,0); true',returnByValue:true});
   await wait(450);
   const metrics=await cdp(target,'Page.getLayoutMetrics');
   const fullHeight=Math.ceil(metrics.cssContentSize?.height||PRESETS[width]);
   if(!Number.isFinite(fullHeight)||fullHeight<1)throw Error('Invalid page height returned by Chrome');
   if(fullHeight>16000)throw Error('Page exceeds 16,000px height safety limit');
   const result=await cdp(target,'Page.captureScreenshot',{format,quality:format==='jpeg'?85:undefined,captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width,height:Math.max(PRESETS[width],fullHeight),scale:1}});
   const slug=page.pathname.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'home';
   const filename='micirql/'+parsed.hostname+'-'+slug+'-'+pages.indexOf(page)+'-'+width+'px.'+(format==='jpeg'?'jpg':'png');
   if(zipMode){await zipMessage('ADD',{name:filename.split('/').pop(),data:result.data})}else if(returnImages){images.push({name:filename.split('/').pop(),data:result.data,mime:'image/'+format});}else{const downloadId=await chrome.downloads.download({url:'data:image/'+format+';base64,'+result.data,filename,saveAs:false,conflictAction:'uniquify'});if(!Number.isInteger(downloadId))throw Error('Chrome did not accept screenshot download'); }
   count++;
   await progress(count,pages.length*widths.length);
  }
  }
  if(zipMode){await progress(count,pages.length*widths.length,'packaging','Creating ZIP…');const archive=await zipMessage('FINISH',{filename:'micirql-screenshots.zip'});const id=await chrome.downloads.download({url:archive.url,filename:'micirql-screenshots.zip',saveAs:false,conflictAction:'uniquify'});if(!Number.isInteger(id))throw Error('ZIP download rejected by Chrome')}
  await progress(count,pages.length*widths.length,'complete','ZIP download started');
  return {ok:true,count,images};
 }finally{
  if(attached){try{await cdp(target,'Emulation.clearDeviceMetricsOverride')}catch{}try{await chrome.debugger.detach(target)}catch{}}
  try{await chrome.tabs.remove(tab.id)}catch{}
 }
}
async function discoverLocalSubpage(url){
 const parsed=new URL(url);
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Invalid website URL');
 const normalize=value=>{try{const u=new URL(value,parsed.href);if(u.origin!==parsed.origin||!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.hash='';u.search='';if(/\\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|woff2?|css|js)$/i.test(u.pathname))return null;return u.href}catch{return null}};
 const start=normalize(parsed.href);
 if(!start)throw Error('Invalid starting page');
 const queued=[start],seen=new Set([start]),visited=new Set(),errors=[];
 const tab=await chrome.tabs.create({url:start,active:false});
 try{
  while(queued.length&&visited.size<60){
   const page=queued.shift();
   try{
    await chrome.tabs.update(tab.id,{url:page});
    await waitForTab(tab.id,25000);
    await wait(300);
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>[...document.querySelectorAll('a[href]')].map(a=>a.href).slice(0,500)});
    visited.add(page);
    for(const value of results[0]?.result||[]){
     const normalized=normalize(value);
     if(normalized&&!seen.has(normalized)&&seen.size<60){seen.add(normalized);queued.push(normalized)}
    }
   }catch(error){visited.add(page);errors.push({url:page,message:error.message||'Could not inspect page'})}
  }
  return {ok:true,pages:[...seen],scanned:visited.size,errors,truncated:queued.length>0};
 }finally{try{await chrome.tabs.remove(tab.id)}catch{}}
}
async function readWebsiteHtml(url){
 const parsed=new URL(url);
 if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Invalid website URL');
 const tab=await chrome.tabs.create({url:parsed.href,active:false});
 try{
  await waitForTab(tab.id);
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>document.documentElement.outerHTML.slice(0,900000)});
  return {ok:true,url:parsed.href,html:results[0]?.result||''};
 }finally{try{await chrome.tabs.remove(tab.id)}catch{}}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id)return false;
 if(message?.type==='DISCOVER_SUBPAGE'){
  discoverLocalSubpage(message.url).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Discovery failed'}));
  return true;
 }
 if(message?.type==='READ_SEO_HTML'){
  readWebsiteHtml(message.url).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Inspection failed'}));
  return true;
 }
 if(message?.type!=='CAPTURE')return false;
 if(captureBusy){sendResponse({ok:false,error:'A capture is already running. Please wait.'});return false;}
 captureBusy=true;
 capture(message.url,message.widths,message.format,message.subpage,!!message.returnImages,message.pages,!!message.zip).then(sendResponse).catch(async error=>{await chrome.storage.local.set({captureProgress:{state:'error',percent:0,message:error.message||'Capture failed'}});sendResponse({ok:false,error:error.message||'Capture failed'})}).finally(()=>{captureBusy=false});
 return true;
});
