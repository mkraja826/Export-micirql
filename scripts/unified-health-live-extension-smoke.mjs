// Real Chrome-extension smoke test: unified public-site scan -> combined A4 PDF.
// Uses the actual extension and the current checkout's first-party UI.
// External demo websites may block the GitHub runner: preserve UNVERIFIED
// evidence, never convert that into a successful website-quality claim.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';

const sites=['https://httpbin.org/links/3/0','https://httpbingo.org/links/3/0'];
const publicRoot=resolve('public'),extension=resolve('extension');
const out=resolve('dist/unified-health-live-evidence');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const report={schema:'micirql-unified-health-live-v1',
 timestamp:new Date().toISOString(),status:'unverified',
 scope:'three_page_public_site_real_chrome_extension',attempts:[],
 source:'real_chrome_extension_v0.3.23',
 caveat:'A public website may change or block requests. This smoke test does not certify website audit accuracy on other sites or prove a full 60-page run.'};
await mkdir(out,{recursive:true});
const profile=await mkdtemp(resolve(tmpdir(),'micirql-unified-live-'));
let context;
try{
 context=await chromium.launchPersistentContext(profile,{
  channel:'chromium',headless:true,
  args:['--disable-extensions-except='+extension,'--load-extension='+extension]
 });
 context.setDefaultTimeout(15000);
 await context.route('https://tools.micirql.com/tools/**',async route=>{
  try{
   const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
   const local=resolve(publicRoot,'.'+pathname);
   if(!local.startsWith(publicRoot+sep))throw Error('Invalid app path');
   const file=pathname.endsWith('/')?resolve(local,'index.html'):local;
   await route.fulfill({status:200,body:await readFile(file),
    contentType:mime[extname(file)]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:'Not found'})}
 });
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://tools.micirql.com/tools/health/',{
  waitUntil:'domcontentloaded',timeout:25000
 });
 await page.locator('#run:not([disabled])').waitFor({state:'visible',timeout:18000});
 report.extensionConnected=true;
 await page.evaluate(()=>{
  window.__unifiedLiveRequests=[];
  window.addEventListener('message',event=>{
   if(event.source===window&&event.origin===location.origin&&
    event.data?.source==='micirql-web'&&event.data.type!=='MICIRQL_EXTENSION_PING'){
    window.__unifiedLiveRequests.push({
     type:event.data.type,safeOnly:event.data.safeOnly===true,url:event.data.url
    });
   }
  });
 });
 for(const url of sites){
  const attempt={website:url,status:'unverified'};
  report.attempts.push(attempt);
  try{
   await page.locator('#url').fill(url);
   await page.locator('#run').click();
   await page.locator('#results').waitFor({state:'visible',timeout:160000});
   const observation=await page.evaluate(()=>({
    progress:Number(document.getElementById('progress')?.value),
    metrics:[...document.querySelectorAll('#metrics .metric')].map(x=>x.textContent),
    sections:[...document.querySelectorAll('#sections .sect h2')].map(x=>x.textContent),
    pageRows:[...document.querySelectorAll('#pages tr')].map(x=>x.textContent),
    priorities:document.getElementById('priorities')?.textContent||'',
    sectionText:document.getElementById('sections')?.textContent||'',
    requests:window.__unifiedLiveRequests
   }));
   attempt.pageRows=observation.pageRows;
   attempt.metrics=observation.metrics;
   attempt.sections=observation.sections;
   attempt.progress=observation.progress;
   const requests=observation.requests;
   attempt.requestCounts=Object.fromEntries(
    [...new Set(requests.map(x=>x.type))].map(type=>[type,requests.filter(x=>x.type===type).length])
   );
   if(observation.progress!==100||observation.sections.length!==8)
    throw Error('Incomplete unified user journey or missing report sections');
   const discovery=requests.filter(x=>x.type==='MICIRQL_DISCOVER');
   if(discovery.length!==1||discovery[0].safeOnly!==true)
    throw Error('Safe-only Chrome discovery was not used exactly once');
   const expectedOrigin=new URL(url).origin;
   for(let i=0;i<3;i++)if(!observation.pageRows.some(row=>row.includes(expectedOrigin+'/links/3/'+i)))
    throw Error('Expected discovered page missing: /links/3/'+i);
   if(!observation.metrics[0]?.includes('3 / 3'))
    throw Error('Some public demo HTML pages were not verified');
   if(requests.filter(x=>x.type==='MICIRQL_SEO_READ').length!==3)
    throw Error('Captured HTML was not shared across the component inspections');
   if(requests.filter(x=>x.type==='MICIRQL_PERFORMANCE_OBSERVE').length!==1)
    throw Error('Expected one Performance Lab navigation observation');
   if(errors.length)throw Error('Unified browser app errors: '+errors.join('; '));
   const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});
   const file=resolve(out,'public-demo-unified-report.pdf');
   await writeFile(file,pdf);
   const printed=execFileSync('pdftotext',['-layout',file,'-'],{
    encoding:'utf8',maxBuffer:6000000
   }).replace(/\s+/g,' ');
   for(const phrase of ['MiCirql Website Health Report','SEO inspection',
    'QA Testing Lab','Link & Sitemap Inspector','Responsive Lab',
    'Accessibility Studio','Security Inspector','Performance Lab',
    'Screenshot Studio','/links/3/0','/links/3/1','/links/3/2']){
    if(!printed.includes(phrase))throw Error('Printed report omitted '+phrase);
   }
   const count=Number(execFileSync('pdfinfo',[file],{encoding:'utf8'})
    .match(/^Pages:\s*(\d+)/m)?.[1]||0);
   if(count<1||count>25)throw Error('A4 PDF pagination invalid: '+count);
   attempt.pdfPages=count;attempt.pdfBytes=pdf.length;
   attempt.status='verified';
   report.status='verified';
   report.website=url;
   report.verifiedPages=3;
   break;
  }catch(error){
   attempt.note=String(error?.message||error).slice(0,850);
   if(url!==sites.at(-1)){
    await page.reload({waitUntil:'domcontentloaded',timeout:25000}).catch(()=>{});
    await page.locator('#run:not([disabled])').waitFor({timeout:15000}).catch(()=>{});
    await page.evaluate(()=>{window.__unifiedLiveRequests=[]}).catch(()=>{});
   }
  }
 }
 await page.close();
}catch(error){
 report.error=String(error?.message||error).slice(0,900);
}finally{
 if(context)await context.close().catch(()=>{});
 await rm(profile,{recursive:true,force:true}).catch(()=>{});
 await writeFile(resolve(out,'live-evidence.json'),JSON.stringify(report,null,2));
 console.log('UNIFIED HEALTH REAL CHROME '+JSON.stringify(report));
}
if(process.argv.includes('--strict')&&report.status!=='verified')process.exitCode=1;
