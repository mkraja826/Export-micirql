// Only MiCirql's first-party website may control the locally installed extension.
const ORIGIN=location.origin;
const TRUSTED=new Set(['https://export.micirql.com','https://tools.micirql.com']);
const reply=(type,id,result)=>window.postMessage({source:'micirql-extension',type,id,...result},ORIGIN);
window.addEventListener('message',async event=>{
 if(event.source!==window||event.origin!==ORIGIN||!TRUSTED.has(ORIGIN)||event.data?.source!=='micirql-web')return;
 const {type,id}=event.data;
 if(type==='MICIRQL_EXTENSION_PING'){reply('MICIRQL_EXTENSION_READY',null,{});return}
 if(typeof id!=='string'||id.length>100)return;
 if(type==='MICIRQL_DISCOVER'){
  let result;
  try{result=await chrome.runtime.sendMessage({type:'DISCOVER_SUBPAGE',url:event.data.url})}
  catch(error){result={ok:false,error:error.message||'Discovery failed'}}
  reply('MICIRQL_DISCOVER_RESULT',id,result||{ok:false,error:'No discovery response'});
 }
 if(type==='MICIRQL_CAPTURE'){
  const {url,pages,subpage='',widths,format,zip=true}=event.data;
  let result,listener;
  try{
   if(typeof url!=='string'||!Array.isArray(widths)||!widths.length||widths.length>3||new Set(widths).size!==widths.length||!widths.every(w=>[375,768,1440].includes(w))||!['jpeg','png'].includes(format))throw Error('Invalid capture request');
   if(pages!==undefined&&(!Array.isArray(pages)||!pages.length||pages.length>60||!pages.every(p=>typeof p==='string')))throw Error('Invalid selected pages');
   listener=(changes,area)=>{
    if(area!=='local'||!changes.captureProgress)return;
    const progress=changes.captureProgress.newValue||{};
    reply('MICIRQL_CAPTURE_PROGRESS',id,{percent:progress.percent,done:progress.done,total:progress.total,message:progress.message||''});
   };
   chrome.storage.onChanged.addListener(listener);
   result=await chrome.runtime.sendMessage({type:'CAPTURE',url,pages,subpage,widths,format,returnImages:false,zip:!!zip});
  }catch(error){result={ok:false,error:error.message||'Extension capture failed'}}
  finally{if(listener)chrome.storage.onChanged.removeListener(listener)}
  reply('MICIRQL_CAPTURE_RESULT',id,{...(result||{ok:false,error:'No capture response'}),zip:!!zip});
 }
 if(type==='MICIRQL_SEO_READ'){
  let result;
  try{result=await chrome.runtime.sendMessage({type:'READ_SEO_HTML',url:event.data.url})}
  catch(error){result={ok:false,error:error.message||'Local inspection failed'}}
  reply('MICIRQL_SEO_RESULT',id,result||{ok:false,error:'No inspection response'});
 }
});
reply('MICIRQL_EXTENSION_READY',null,{});
