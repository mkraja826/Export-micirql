const PRESETS={375:812,768:1024,1440:900};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let captureBusy=false;
async function cdp(target,method,params={}){return chrome.debugger.sendCommand(target,method,params)}
async function capture(url,widths,format,subpage='',returnImages=false){
 const parsed=new URL(url);
 if(!['http:','https:'].includes(parsed.protocol))throw Error('Enter an HTTP(S) website URL.');
 if(!Array.isArray(widths)||!widths.length||widths.length>3||widths.some(w=>!PRESETS[w])||!['jpeg','png'].includes(format))throw Error('Invalid capture settings.');
 const pages=[parsed];if(subpage){const second=new URL(subpage);if(!['http:','https:'].includes(second.protocol)||second.origin!==parsed.origin)throw Error('Subpage must be on the same website.');if(second.href!==parsed.href)pages.push(second);}
 const tab=await chrome.tabs.create({url:parsed.href,active:false});
 const target={tabId:tab.id};let attached=false,count=0;const images=[];
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Page load timed out')),45000);const listener=(id,change)=>{if(id===tab.id&&change.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve()}};chrome.tabs.onUpdated.addListener(listener);chrome.tabs.get(tab.id).then(t=>{if(t.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve()}}).catch(reject)});
  await chrome.debugger.attach(target,'1.3');attached=true;
  await cdp(target,'Page.enable');
  for(const page of pages){
   if(page.href!==parsed.href){await cdp(target,'Page.navigate',{url:page.href});await wait(2500);}
  for(const width of widths){
   await cdp(target,'Emulation.setDeviceMetricsOverride',{width,height:PRESETS[width],deviceScaleFactor:1,mobile:width===375});
   await wait(1100);
   const metrics=await cdp(target,'Page.getLayoutMetrics');
   const fullHeight=Math.ceil(metrics.cssContentSize?.height||PRESETS[width]);
   if(fullHeight>16000)throw Error('Page exceeds 16,000px height safety limit');
   const result=await cdp(target,'Page.captureScreenshot',{format,quality:format==='jpeg'?85:undefined,captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width,height:Math.max(PRESETS[width],fullHeight),scale:1}});
   const slug=page.pathname.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'home';
   const filename='micirql/'+parsed.hostname+'-'+slug+'-'+width+'px.'+(format==='jpeg'?'jpg':'png');
   if(returnImages){images.push({name:filename.split('/').pop(),data:result.data,mime:'image/'+format});}else{await chrome.downloads.download({url:'data:image/'+format+';base64,'+result.data,filename,saveAs:false,conflictAction:'uniquify'}); }
   count++;
  }
  }
  return {ok:true,count,images};
 }finally{
  if(attached){try{await cdp(target,'Emulation.clearDeviceMetricsOverride')}catch{}try{await chrome.debugger.detach(target)}catch{}}
  try{await chrome.tabs.remove(tab.id)}catch{}
 }
}
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
 if(message?.type!=='CAPTURE')return false;
 if(captureBusy){sendResponse({ok:false,error:'A capture is already running. Please wait.'});return false;}
 captureBusy=true;
 capture(message.url,message.widths,message.format,message.subpage,!!message.returnImages).then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message||'Capture failed'})).finally(()=>{captureBusy=false});
 return true;
});
