const PRESETS={375:812,768:1024,1440:900};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let captureBusy=false;
async function cdp(target,method,params={}){return chrome.debugger.sendCommand(target,method,params)}
async function waitForTab(tabId,timeout=45000){return new Promise((resolve,reject)=>{let done=false;const cleanup=()=>{chrome.tabs.onUpdated.removeListener(onUpdate);clearTimeout(timer)};const finish=error=>{if(done)return;done=true;cleanup();error?reject(error):resolve()};const onUpdate=(id,change)=>{if(id===tabId&&change.status==='complete')finish()};const timer=setTimeout(()=>finish(Error('Page load timed out')),timeout);chrome.tabs.onUpdated.addListener(onUpdate);chrome.tabs.get(tabId).then(tab=>{if(tab.status==='complete')finish()}).catch(finish)})}
async function capture(url,widths,format,subpage='',returnImages=false){
 const parsed=new URL(url);
 if(!['http:','https:'].includes(parsed.protocol))throw Error('Enter an HTTP(S) website URL.');
 if(parsed.username||parsed.password)throw Error('URLs with embedded credentials are not supported.');
 if(!Array.isArray(widths)||!widths.length||widths.length>3||new Set(widths).size!==widths.length||widths.some(w=>!Object.hasOwn(PRESETS,w))||!['jpeg','png'].includes(format))throw Error('Invalid capture settings.');
 const pages=[parsed];if(subpage){const second=new URL(subpage);if(!['http:','https:'].includes(second.protocol)||second.origin!==parsed.origin)throw Error('Subpage must be on the same website.');if(second.href!==parsed.href)pages.push(second);}
 const tab=await chrome.tabs.create({url:parsed.href,active:false});
 const target={tabId:tab.id};let attached=false,count=0;const images=[];
 try{
  await waitForTab(tab.id);
  await chrome.debugger.attach(target,'1.3');attached=true;
  await cdp(target,'Page.enable');
  for(const page of pages){
   if(page.href!==parsed.href){await chrome.tabs.update(tab.id,{url:page.href});await waitForTab(tab.id);await wait(1200);}
  for(const width of widths){
   await cdp(target,'Emulation.setDeviceMetricsOverride',{width,height:PRESETS[width],deviceScaleFactor:1,mobile:width===375});
   await wait(1100);
   const metrics=await cdp(target,'Page.getLayoutMetrics');
   const fullHeight=Math.ceil(metrics.cssContentSize?.height||PRESETS[width]);
   if(!Number.isFinite(fullHeight)||fullHeight<1)throw Error('Invalid page height returned by Chrome');
   if(fullHeight>16000)throw Error('Page exceeds 16,000px height safety limit');
   const result=await cdp(target,'Page.captureScreenshot',{format,quality:format==='jpeg'?85:undefined,captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width,height:Math.max(PRESETS[width],fullHeight),scale:1}});
   const slug=page.pathname.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'home';
   const filename='micirql/'+parsed.hostname+'-'+slug+'-'+width+'px.'+(format==='jpeg'?'jpg':'png');
   if(returnImages){images.push({name:filename.split('/').pop(),data:result.data,mime:'image/'+format});}else{const downloadId=await chrome.downloads.download({url:'data:image/'+format+';base64,'+result.data,filename,saveAs:false,conflictAction:'uniquify'});if(!Number.isInteger(downloadId))throw Error('Chrome did not accept screenshot download'); }
   count++;
  }
  }
  return {ok:true,count,images};
 }finally{
  if(attached){try{await cdp(target,'Emulation.clearDeviceMetricsOverride')}catch{}try{await chrome.debugger.detach(target)}catch{}}
  try{await chrome.tabs.remove(tab.id)}catch{}
 }
}
async function discoverLocalSubpage(url){
 const parsed=new URL(url);
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Invalid website URL');
 const tab=await chrome.tabs.create({url:parsed.href,active:false});
 try{
  await waitForTab(tab.id);
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   const preferred=['/about','/about-us','/services','/contact','/contact-us'];
   const links=[...document.querySelectorAll('a[href]')].map(a=>{try{return new URL(a.href,location.href)}catch{return null}}).filter(Boolean);
   const origin=location.origin;
   for(const path of preferred){const found=links.find(link=>link.origin===origin&&link.pathname.replace(/\/$/,'').toLowerCase()===path);if(found)return found.href}
   return null;
  }});
  return {ok:true,subpage:results[0]?.result||null};
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
 capture(message.url,message.widths,message.format,message.subpage,!!message.returnImages).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Capture failed'})).finally(()=>{captureBusy=false});
 return true;
});
