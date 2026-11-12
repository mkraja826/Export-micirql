// Read-only Responsive Lab evaluation of Chrome-observed layout metrics.
// A measured overflow is evidence of document width, not proof of visual overlap,
// clipping, a user-visible defect, or WCAG failure.
export const RESPONSIVE_VIEWPORTS=[375,768,1440];
export const RESPONSIVE_PAGE_SAMPLE_LIMIT=3;
const clean=value=>{
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.hash='';return u.href}
 catch{return null}
};
export function chooseResponsiveSamples(discovery,entryUrl,limit=RESPONSIVE_PAGE_SAMPLE_LIMIT){
 if(!Number.isInteger(limit)||limit<1||limit>RESPONSIVE_PAGE_SAMPLE_LIMIT)
  throw Error('Responsive sample must include 1–3 pages');
 const root=clean(entryUrl);if(!root)throw Error('Invalid website URL');
 const origin=new URL(root).origin;
 const urls=[...new Set([root,...(Array.isArray(discovery)?discovery:[])].map(clean)
  .filter(url=>url&&new URL(url).origin===origin))].slice(0,60);
 const selected=[root],isPriority=url=>/\/(contact|contact-us|book|booking|appointment|services|products)(\/|$)/i.test(new URL(url).pathname);
 const preferred=urls.find(url=>url!==root&&isPriority(url));if(preferred)selected.push(preferred);
 for(const url of urls)if(selected.length<limit&&!selected.includes(url))selected.push(url);
 return {entryUrl:root,discoveredValidPages:urls.length,selectedPages:selected,selectionLimited:urls.length>selected.length};
}
const integer=v=>Number.isFinite(v)&&v>=0?Math.round(v):null;
export function buildResponsiveReport({website,discoveredPages=0,discoveryTruncated=false,samples=[]}){
 const root=clean(website);if(!root)throw Error('Invalid website URL');
 if(!Array.isArray(samples)||samples.length>RESPONSIVE_PAGE_SAMPLE_LIMIT)throw Error('Too many responsive samples');
 const origin=new URL(root).origin,seen=new Set(),pages=[],signals=[];
 for(const sample of samples){
  const url=clean(sample?.requestedUrl);
  if(!url||new URL(url).origin!==origin||seen.has(url))throw Error('Invalid or duplicate sampled page');
  seen.add(url);
  const observations=Array.isArray(sample?.observations)?sample.observations:[];
  const widths=new Set(),viewports=[];
  for(const width of RESPONSIVE_VIEWPORTS){
   const match=observations.find(o=>o?.width===width);
   if(match)widths.add(width);
   const eligible=match?.verified===true&&Number.isFinite(match?.observedWidth)&&
    Number.isFinite(match?.documentWidth)&&Number.isFinite(match?.horizontalOverflowPx)&&
    match.observedWidth>0&&match.documentWidth>=0&&match.horizontalOverflowPx>=0;
   const measured=eligible?{
    width,verification:'verified',observedCssWidth:integer(match.observedWidth),
    documentWidth:integer(match.documentWidth),horizontalOverflowPx:integer(match.horizontalOverflowPx),
    scaledMobileLayout:width===375&&match.scaledMobileLayout===true,
    missingMobileViewportMeta:width===375&&match.missingMobileViewportMeta===true
   }:{width,verification:'unverified',reason:match?.reason||sample?.error||'viewport_not_measured'};
   viewports.push(measured);
   if(!eligible)continue;
   const push=(code,severity,summary)=>signals.push({url,width,code,severity,summary,
    evidence:{observedCssWidth:measured.observedCssWidth,documentWidth:measured.documentWidth,
     horizontalOverflowPx:measured.horizontalOverflowPx}});
   if(measured.horizontalOverflowPx>4)push('document_horizontal_overflow','review',
    'Document exceeds measured CSS viewport by '+measured.horizontalOverflowPx+'px');
   if(measured.scaledMobileLayout)push('scaled_mobile_layout','review',
    'Mobile device renders a wider CSS layout viewport and scales the page');
   if(measured.missingMobileViewportMeta)push('missing_mobile_viewport','review',
    'The document did not declare a mobile viewport meta tag');
  }
  pages.push({url,viewports,verifiedViewports:viewports.filter(v=>v.verification==='verified').length});
 }
 const verified=pages.reduce((n,p)=>n+p.verifiedViewports,0);
 return {schemaVersion:1,tool:'responsive',website:origin,generatedAt:new Date().toISOString(),
  viewports:RESPONSIVE_VIEWPORTS.slice(),
  coverage:{discoveredPages,discoveryTruncated:discoveryTruncated===true,
   sampledPages:pages.length,selectionLimited:discoveredPages>pages.length,
   expectedViewportChecks:pages.length*RESPONSIVE_VIEWPORTS.length,verifiedViewportChecks:verified,
   unverifiedViewportChecks:pages.length*RESPONSIVE_VIEWPORTS.length-verified},
  summary:{measuredOverflowSignals:signals.filter(x=>x.code==='document_horizontal_overflow').length,
   scaledMobileSignals:signals.filter(x=>x.code==='scaled_mobile_layout').length,
   missingMobileViewportSignals:signals.filter(x=>x.code==='missing_mobile_viewport').length,
   reviewSignals:signals.length},
  pages,signals,limitations:[
   'Three-page sampling cannot establish whole-site responsive correctness; pages not selected are not evaluated',
   'Viewport-width and document-width observations are not screenshot-backed clipping or overlap evidence',
   'A zero-overflow measurement is not proof of visual usability, typography quality, or accessibility',
   'Unverified viewport observations are not successful checks'
  ]};
}
