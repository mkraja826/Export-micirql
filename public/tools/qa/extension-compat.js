// QA Lab's read-only browser contract. Keep version parsing conservative:
// a missing/invalid manifest version is not proof that layout observations are supported.
export const MIN_QA_LAYOUT_EXTENSION_VERSION='0.3.17';
const parseVersion=value=>{
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(String(value||'').trim());
 return match?match.slice(1).map(Number):null;
};
export function meetsQaLayoutVersion(version){
 const current=parseVersion(version),minimum=parseVersion(MIN_QA_LAYOUT_EXTENSION_VERSION);
 if(!current||!minimum)return false;
 for(let i=0;i<3;i++){
  if(current[i]>minimum[i])return true;
  if(current[i]<minimum[i])return false;
 }
 return true;
}
export function evaluateQaExtensionHandshake(payload){
 const capabilities=Array.isArray(payload?.capabilities)?payload.capabilities.filter(value=>typeof value==='string'):[];
 const protocol=payload?.protocol;
 const version=typeof payload?.extensionVersion==='string'?payload.extensionVersion:'unknown';
 const base=protocol===3&&capabilities.includes('discover')&&capabilities.includes('seo-http-evidence');
 if(!base)return {
  supported:false,layoutSupported:false,version,status:'unsupported',
  message:'Chrome extension detected, but its website-inspection protocol is outdated or incomplete. Update the MiCirql extension before scanning.'
 };
 const layoutSupported=capabilities.includes('qa-layout')&&meetsQaLayoutVersion(version);
 return {supported:true,layoutSupported,version,status:layoutSupported?'ready':'limited',
  message:layoutSupported?
   'Chrome extension v'+version+' connected. HTML and read-only layout inspection are available.':
   'Chrome extension v'+version+' connected for HTML-only checks. Update to v'+MIN_QA_LAYOUT_EXTENSION_VERSION+' or newer for trustworthy three-viewport layout evidence.'};
}
