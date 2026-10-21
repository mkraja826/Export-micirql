// Content-script bridge: only the first-party MiCirql Export origin is permitted.
const ORIGIN='https://export.micirql.com';
window.addEventListener('message',async event=>{
 if(event.source!==window||event.origin!==ORIGIN||event.data?.source!=='micirql-web'||event.data?.type!=='MICIRQL_CAPTURE')return;
 const {id,url,subpage='',widths,format}=event.data;
 if(typeof id!=='string'||id.length>100)return;
 let response;
 try{
  if(typeof url!=='string'||!Array.isArray(widths)||widths.length>3||!widths.every(w=>[375,768,1440].includes(w))||!['jpeg','png'].includes(format))throw Error('Invalid capture request');
  response=await chrome.runtime.sendMessage({type:'CAPTURE',url,subpage,widths,format,returnImages:false});
 }catch(error){response={ok:false,error:error.message||'Extension capture failed'}}
 window.postMessage({source:'micirql-extension',type:'MICIRQL_CAPTURE_RESULT',id,...response},ORIGIN);
});
window.postMessage({source:'micirql-extension',type:'MICIRQL_EXTENSION_READY'},ORIGIN);

window.addEventListener('message',event=>{if(event.source===window&&event.origin===ORIGIN&&event.data?.source==='micirql-web'&&event.data?.type==='MICIRQL_EXTENSION_PING')window.postMessage({source:'micirql-extension',type:'MICIRQL_EXTENSION_READY'},ORIGIN)});
