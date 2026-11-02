// Optional real-website smoke test for the actual Chrome extension bridge.
// Read-only: no form submissions, link clicks, user-data entry, or screenshots.
// Public test sites may be unreachable in CI; failures remain UNVERIFIED, never PASS.
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const targets=[
 {url:'https://badseo.dev/head/missing-h1',expected:'missing_h1'},
 {url:'https://badseo.dev/content/images-missing-alt',expected:'missing_image_alt'},
 {url:'https://testingurl.dev/scraping/forms/basic',expected:'formControls'}
];
const root=resolve('public'),extension=resolve('extension'),outDir=resolve('dist/qa-live-smoke');
const report={schema:'micirql-qa-live-smoke-v1',timestamp:new Date().toISOString(),mode:'read_only',
 extensionVerified:false,extensionVersion:null,results:[],overall:'unverified',
 disclaimer:'Only these three public test pages are inspected. This does not verify the full 60-page workflow or user form submissions.'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const profile=await mkdtemp(resolve(tmpdir(),'micirql-qa-extension-'));
let context;
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,
  args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
 context.setDefaultTimeout(18000);
 // Serve CURRENT checkout's QA application from the expected first-party origin;
 // don't rely on the last deployed version or ask Chrome to connect to local origin.
 await context.route('https://tools.micirql.com/tools/qa/**',async route=>{
  try{
   const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
   const file=resolve(root,'.'+pathname);
   if(file!==root&&!file.startsWith(root+sep))throw Error('Unsafe file path');
   const local=pathname.endsWith('/')?resolve(file,'index.html'):file;
   const data=await readFile(local);
   await route.fulfill({status:200,body:data,contentType:types[extname(local)]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:'Not found'})}
 });
 const page=await context.newPage();
 await page.goto('https://tools.micirql.com/tools/qa/',{waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForFunction(()=>{
  const state=document.getElementById('extension-status')?.dataset?.state;
  return state==='ready'||state==='limited'||state==='unsupported';
 },{timeout:18000});
 const state=await page.locator('#extension-status').getAttribute('data-state');
 const extensionStatus=await page.locator('#extension-status').textContent();
 const compatible=state==='ready';
 if(!compatible)throw Error('Installed Chrome extension contract is not ready: '+extensionStatus);
 report.extensionVerified=true;
 report.extensionVersion='0.3.17 or newer (compatible browser handshake)';
 // Send same first-party messages as QA Lab, but inspect only these three known test pages.
 for(const target of targets){
  const item={url:target.url,expected:target.expected,status:'unverified',findings:[]};
  try{
   const response=await page.evaluate(async url=>{
    return await new Promise((resolve,reject)=>{
     const id='liveqa-'+Date.now()+'-'+Math.random().toString(36).slice(2);
     let timer;
     const receive=event=>{
      const payload=event.data;
      if(event.source!==window||event.origin!==location.origin||payload?.source!=='micirql-extension'||payload.id!==id||payload.type!=='MICIRQL_SEO_RESULT')return;
      clearTimeout(timer);window.removeEventListener('message',receive);resolve(payload);
     };
     window.addEventListener('message',receive);
     timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('Timed out waiting for extension response'))},28000);
     window.postMessage({source:'micirql-web',type:'MICIRQL_SEO_READ',id,url},location.origin);
    });
   },target.url);
   if(!response.ok||response.partial||typeof response.html!=='string')throw Error(response.error||'HTML capture unavailable or partial');
   const inspected=await page.evaluate(({html,url})=>{
    // Inspector is loaded in the active QA module, but is not a global.
    // Import the exact browser inspector that ships with the current website.
    return import('/tools/qa/inspector.js').then(({inspectQaHtml})=>inspectQaHtml(html,url));
   },{html:response.html,url:target.url});
   item.findings=inspected.findings.map(f=>f.code);
   item.capturedBytes=response.html.length;
   item.status=target.expected==='formControls'?
    (inspected.counts.formControls>0?'verified':'mismatch'):
    (item.findings.includes(target.expected)?'verified':'mismatch');
   item.formControls=inspected.counts.formControls;
   // A mismatch means the known site might have changed, not necessarily the tool is wrong.
   if(item.status==='mismatch')item.note='Public benchmark content or QA detection differs from the expected fixture; review raw evidence.';
  }catch(error){item.note=String(error?.message||error).slice(0,220)}
  report.results.push(item);
 }
 // Separately verify one real public page at all three viewports. This is a
 // Chrome read-only DOM observation: it never clicks or submits the site.
 report.layout={url:'https://badseo.dev/head/missing-h1',status:'unverified',observations:[]};
 try{
  const response=await page.evaluate(async url=>new Promise((resolve,reject)=>{
   const id='live-layout-'+Date.now()+'-'+Math.random().toString(36).slice(2);
   const receive=event=>{
    const payload=event.data;
    if(event.source!==window||event.origin!==location.origin||payload?.source!=='micirql-extension'||payload.id!==id||payload.type!=='MICIRQL_QA_LAYOUT_RESULT')return;
    clearTimeout(timer);window.removeEventListener('message',receive);resolve(payload);
   };
   window.addEventListener('message',receive);
   const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('Timed out waiting for layout response'))},30000);
   window.postMessage({source:'micirql-web',type:'MICIRQL_QA_LAYOUT',id,url},location.origin);
  }),report.layout.url);
  if(!response.ok)throw Error(response.error||'Extension could not inspect layout');
  if(response.interactionTesting!==false)throw Error('Layout response lacks explicit read-only interaction scope');
  const observations=Array.isArray(response.observations)?response.observations:[];
  report.layout.observations=observations.map(x=>({
   width:x.width,verified:x.verified===true,
   horizontalOverflowPx:x.verified===true?x.horizontalOverflowPx:null,
   unlabelledVisibleFields:x.verified===true?x.unlabelledVisibleFields:null
  }));
  const widths=[375,768,1440];
  report.layout.status=observations.length===3&&observations.every((x,i)=>
   x.verified===true&&x.width===widths[i]&&Number.isFinite(x.horizontalOverflowPx))?'verified':'unverified';
  if(report.layout.status!=='verified')report.layout.error='At least one requested viewport was not verified by Chrome';
 }catch(error){report.layout.error=String(error?.message||error).slice(0,220)}
 report.overall=report.results.every(x=>x.status==='verified')&&report.layout.status==='verified'?
  'verified':report.results.some(x=>x.status==='mismatch')?'needs_review':'unverified';
 await page.close();
}catch(error){
 report.error=String(error?.message||error).slice(0,400);
 report.overall='unverified';
}finally{
 if(context)await context.close().catch(()=>{});
 await rm(profile,{force:true,recursive:true}).catch(()=>{});
 await mkdir(outDir,{recursive:true});
 await writeFile(resolve(outDir,'live-site-results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
if(process.argv.includes('--strict')&&report.overall!=='verified')process.exitCode=1;
