// End-to-end Chromium regression for MiCirql's combined one-URL -> one-PDF journey.
// Injects a deterministic extension-protocol fixture; validates real browser UI,
// evidence provenance, request counts, and the printed report. The public-site
// Chrome-extension smoke test remains separate and informational.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,sep,extname} from 'node:path';

const site='https://fixture.example/';
const home='<!doctype html><html lang="en"><head><title>Example services</title>'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta name="description" content="A demonstration business offering quality services and contact information."></head>'+
 '<body><main><h1>Example services</h1><p>Find public services and contact us.</p>'+
 '<a href="/contact">Contact us</a><a href="/broken">Broken</a><a href="/unknown">Unknown</a>'+
 '<img src="/hero.png"></main></body></html>';
const contact='<!doctype html><html lang="en"><head><title>Contact example</title>'+
 '<meta name="description" content="Reach the Example services team through our public contact page."></head>'+
 '<body><main><h1>Contact us</h1><p>Our team can answer customer questions.</p>'+
 '<a href="/">Home</a><a href="/broken">Broken link</a>'+
 '<label for="email">Your email</label><input id="email" type="email"></main></body></html>';
const root=resolve('public'),out=resolve('dist/unified-health-browser-workflow');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
let page;
try{
 page=await browser.newPage({viewport:{width:1220,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://tools.micirql.com/tools/**',async route=>{
  try{
   const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
   const resolved=resolve(root,'.'+pathname);
   if(!resolved.startsWith(root+sep))throw Error('Unsafe fixture path');
   const name=pathname.endsWith('/')?resolve(resolved,'index.html'):resolved;
   await route.fulfill({status:200,body:await readFile(name),
    contentType:types[extname(name)]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:'Not found'})}
 });
 await page.addInitScript(({site,home,contact})=>{
  const discoveries=[site,site+'contact',site+'partial'];
  window.__healthProtocolRequests=[];
  window.addEventListener('message',event=>{
   const request=event.data;
   if(event.source!==window||event.origin!==location.origin||request?.source!=='micirql-web')return;
   const send=(type,fields)=>setTimeout(()=>window.postMessage({
    source:'micirql-extension',type,id:request.id||null,...fields
   },location.origin),0);
   if(request.type==='MICIRQL_EXTENSION_PING'){
    send('MICIRQL_EXTENSION_READY',{protocol:3,extensionVersion:'0.3.23',
     capabilities:['discover','seo-http-evidence','qa-layout','links-sitemap',
      'security-headers','performance-navigation','safe-page-discovery']});
    return;
   }
   window.__healthProtocolRequests.push({type:request.type,url:request.url,
    safeOnly:request.safeOnly===true});
   if(request.type==='MICIRQL_DISCOVER'){
    send('MICIRQL_DISCOVER_RESULT',{ok:true,pages:discoveries,scanned:3,
     originalCount:3,truncated:false});return;
   }
   if(request.type==='MICIRQL_SEO_READ'){
    const partial=request.url===site+'partial';
    send('MICIRQL_SEO_RESULT',{ok:true,url:request.url,html:partial?
     '<html><head><title>Partial</title></head><body>Incomplete</body></html>':
     request.url===site?home:contact,partial,
     httpEvidence:{observed:true,status:200}});return;
   }
   if(request.type==='MICIRQL_SEO_LINK_CHECK'){
    let status=200,ok=true,reason=null;
    if(request.url===site+'broken')status=404;
    if(request.url===site+'unknown'){ok=false;status=404;reason='network_timeout'}
    send('MICIRQL_SEO_LINK_RESULT',{ok,status,url:request.url,finalUrl:request.url,reason});
    return;
   }
   if(request.type==='MICIRQL_LINK_SITEMAP'){
    send('MICIRQL_LINK_SITEMAP_RESULT',{ok:true,observed:true,status:200,
     body:'<?xml version="1.0"?><urlset><url><loc>'+site+
      '</loc></url><url><loc>'+site+'contact</loc></url></urlset>'});return;
   }
   if(request.type==='MICIRQL_QA_LAYOUT'){
    const observations=[375,768,1440].map(width=>({
     width,verified:true,observedWidth:width,documentWidth:width===375?width+18:width,
     horizontalOverflowPx:width===375?18:0,
     scaledMobileLayout:false,missingMobileViewportMeta:false,
     buttonsWithoutNames:0,unlabelledVisibleFields:0
    }));
    send('MICIRQL_QA_LAYOUT_RESULT',{ok:true,observations,interactionTesting:false});return;
   }
   if(request.type==='MICIRQL_SECURITY_HEADERS'){
    send('MICIRQL_SECURITY_HEADERS_RESULT',{ok:true,observed:true,
     url:request.url,status:200,headers:{'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'self'"}});return;
   }
   if(request.type==='MICIRQL_PERFORMANCE_OBSERVE'){
    send('MICIRQL_PERFORMANCE_RESULT',{ok:true,observed:true,url:request.url,
     scope:'one_unthrottled_browser_navigation',readyState:'complete',
     timing:{responseStartMs:120,responseEndMs:180,domContentLoadedMs:400,
      loadEventMs:650,firstContentfulPaintMs:null},
     resources:{entryCount:3,entriesWithTransferSize:2,entriesWithoutTransferSize:1,
      reportedTransferBytes:5000,selectionTruncated:false,
      byInitiatorType:{script:1,css:1,img:1}}});return;
   }
  });
 },{site,home,contact});
 await page.goto('https://tools.micirql.com/tools/health/',{waitUntil:'domcontentloaded'});
 await page.locator('#run:not([disabled])').waitFor({state:'visible',timeout:15000});
 await page.locator('#url').fill(site);
 await page.locator('#run').click();
 await page.locator('#results').waitFor({state:'visible',timeout:90000});
 const evidence=await page.evaluate(()=>({
  progress:document.querySelector('#progress')?.value,
  metrics:[...document.querySelectorAll('#metrics .metric')].map(x=>x.textContent),
  priorities:document.querySelector('#priorities')?.textContent||'',
  sections:[...document.querySelectorAll('#sections .sect h2')].map(x=>x.textContent),
  sectionText:document.querySelector('#sections')?.textContent||'',
  pages:[...document.querySelectorAll('#pages tr')].map(x=>x.textContent),
  requests:window.__healthProtocolRequests
 }));
 const count=type=>evidence.requests.filter(x=>x.type===type).length;
 if(evidence.progress!==100||evidence.pages.length!==3||
  !evidence.metrics.some(x=>x.includes('2 / 3')))
  throw Error('Page coverage/progress mismatch: '+JSON.stringify(evidence.metrics));
 if(!evidence.pages[2].includes('unverified')||!evidence.pages[2].includes('incomplete'))
  throw Error('Partial HTML capture was not reported as unverified');
 if(evidence.sections.length!==8||count('MICIRQL_DISCOVER')!==1||
  count('MICIRQL_SEO_READ')!==3||count('MICIRQL_LINK_SITEMAP')!==1||
  count('MICIRQL_PERFORMANCE_OBSERVE')!==1)
  throw Error('Unified scan failed shared-capture contract: '+JSON.stringify(evidence.requests));
 if(!evidence.requests.find(x=>x.type==='MICIRQL_DISCOVER')?.safeOnly)
  throw Error('Unified website scan failed to request safe-only Chrome discovery');
 const requestedLinks=evidence.requests.filter(x=>x.type==='MICIRQL_SEO_LINK_CHECK');
 if(requestedLinks.length!==4)throw Error('Unexpected unique link destination count: '+requestedLinks.length);
 if(!evidence.priorities.includes('HTTP 404')||
  !evidence.sectionText.includes('1 confirmed 404/410')||
  !evidence.sectionText.includes('1 unverified')||
  !evidence.sectionText.includes('18px')||
  !evidence.sectionText.includes('FCP:')&&
  !evidence.sectionText.includes('First Contentful Paint: Not observed'))
  throw Error('Required evidence or unverified caveat missing from report');
 if(errors.length)throw Error('Browser frontend errors: '+errors.join('; '));
 const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});
 const file=resolve(out,'unified-e2e.pdf');await writeFile(file,pdf);
 const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8',maxBuffer:6000000})
  .replace(/\s+/g,' ');
 for(const phrase of ['MiCirql Website Health Report','Link & Sitemap Inspector','HTTP 404',
  'Accessibility Studio','Security Inspector','Performance Lab',
  'Screenshot Studio','not run','/partial','unverified']){
  if(!text.includes(phrase))throw Error('End-to-end PDF missing '+phrase);
 }
 const pages=Number(execFileSync('pdfinfo',[file],{encoding:'utf8'}).match(/^Pages:\s*(\d+)/m)?.[1]||0);
 if(pages<2||pages>22)throw Error('PDF pagination outside expected bounds: '+pages);
 const tail=execFileSync('pdftotext',['-f',String(pages),'-l',String(pages),file,'-'],{encoding:'utf8'});
 if(tail.trim().length<30)throw Error('Final PDF page has no evidence text');
 const summary={status:'verified',fixture:'synthetic first-party protocol',
  sharedHtmlCaptureRequests:count('MICIRQL_SEO_READ'),
  selectedPages:evidence.pages.length,linkRequests:requestedLinks.length,
  layoutRequests:count('MICIRQL_QA_LAYOUT'),
  securityRequests:count('MICIRQL_SECURITY_HEADERS'),
  performanceRequests:count('MICIRQL_PERFORMANCE_OBSERVE'),
  pdfPages:pages,
  limitation:'This verifies browser UI and protocol integration with simulated extension responses; not real public-site accuracy.'};
 await writeFile(resolve(out,'result.json'),JSON.stringify(summary,null,2));
 console.log('UNIFIED HEALTH E2E '+JSON.stringify(summary));
}finally{
 await page?.close().catch(()=>{});
 await browser.close();
}
