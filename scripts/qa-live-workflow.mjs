// End-to-end QA Lab: actual Chrome extension discovery -> HTML -> layout -> A4 PDF.
// Public, read-only websites only. Never click a tested site link or submit a form.
// External-site failure is UNVERIFIED (not a silently successful test).
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {extname,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';

const fixtures=[
 {url:'https://httpbin.org/links/3/0',origin:'https://httpbin.org'},
 {url:'https://httpbingo.org/links/3/0',origin:'https://httpbingo.org'}
];
const root=resolve('public'),extension=resolve('extension');
const out=resolve('dist/qa-live-workflow'),types={
 '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'
};
const result={schema:'micirql-qa-live-workflow-v1',timestamp:new Date().toISOString(),
 status:'unverified',scope:'read_only_public_three_page_website',attempts:[],
 checkedPages:0,layoutPages:0,pdfPages:0,source:'real_browser_extension',
 limitation:'Only a three-page public demo is checked; this is not a 60-page live stress test, functional user-journey test, or accessibility certification.'};
const profile=await mkdtemp(resolve(tmpdir(),'micirql-qa-workflow-'));
let browser;
try{
 browser=await chromium.launchPersistentContext(profile,{
  channel:'chromium',headless:true,
  args:['--disable-extensions-except='+extension,'--load-extension='+extension]
 });
 browser.setDefaultTimeout(15000);
 // Load this exact checkout from the real first-party origin so the installed
 // extension bridge accepts its messages; no dependence on deployed assets.
 await browser.route('https://tools.micirql.com/tools/qa/**',async route=>{
  try{
   const name=decodeURIComponent(new URL(route.request().url()).pathname);
   const resolved=resolve(root,'.'+name);
   if(resolved!==root&&!resolved.startsWith(root+sep))throw Error('Invalid fixture path');
   const file=name.endsWith('/')?resolve(resolved,'index.html'):resolved;
   await route.fulfill({status:200,body:await readFile(file),
    contentType:types[extname(file)]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:'Not found'})}
 });
 const page=await browser.newPage();
 page.setDefaultNavigationTimeout(25000);
 const jsErrors=[];
 page.on('pageerror',error=>jsErrors.push(error.message));
 await page.goto('https://tools.micirql.com/tools/qa/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#extension-status')?.dataset?.state==='ready',null,{timeout:20000});
 // Count only extension protocol messages sent from QA Lab's actual web app.
 await page.evaluate(()=>{
  window.__qaWorkflowRequests=[];
  window.addEventListener('message',event=>{
   if(event.source===window&&event.origin===location.origin&&event.data?.source==='micirql-web'){
    window.__qaWorkflowRequests.push(event.data.type);
   }
  });
 });
 for(const target of fixtures){
  const attempt={url:target.url,status:'unverified'};
  result.attempts.push(attempt);
  try{
   await page.locator('#url').fill(target.url);
   await page.locator('#run').click();
   // A published report is not automatically a PASS: inspect evidence in detail.
   await page.locator('#results').waitFor({state:'visible',timeout:105000});
   const evidence=await page.evaluate(()=>{
    const metrics=[...document.querySelectorAll('#metrics .metric strong')].map(x=>Number(x.textContent));
    const pages=[...document.querySelectorAll('#pages > details > summary')].map(x=>x.textContent||'');
    const layouts=[...document.querySelectorAll('#layout-details > details > summary')].map(x=>x.textContent||'');
    return {metrics,pages,layouts,progress:document.querySelector('#progress')?.value,
      reportSite:document.querySelector('#report-site')?.textContent,
      priorityText:document.querySelector('#priority-section')?.textContent||'',
      summaryText:document.querySelector('#summary')?.textContent||'',
      provisionalText:document.querySelector('#provisional-summary')?.textContent||''};
   });
   const base=target.origin+'/links/3/';
   const expected=[base+'0',base+'1',base+'2'];
   const expectedPages=expected.every(link=>evidence.pages.some(item=>item.startsWith(link+' · ')));
   attempt.htmlPages=evidence.metrics[0];
   attempt.unverifiedPages=evidence.metrics[2];
   attempt.layoutPages=evidence.metrics[3];
   attempt.listedPages=evidence.pages.length;
   attempt.pageUrls=evidence.pages.map(text=>text.split(' · ')[0]);
   const countsAreCorrect=evidence.metrics[0]===3&&evidence.metrics[2]===0
    &&evidence.metrics[3]===3&&evidence.pages.length===3&&evidence.layouts.length===3;
   if(!expectedPages||!countsAreCorrect||evidence.progress!==100)
    throw Error('Incomplete discovery, HTML inspection, or layout sampling: '+JSON.stringify({
     expectedPages,countsAreCorrect,progress:evidence.progress,metrics:evidence.metrics,pages:evidence.pages
    }).slice(0,700));
   if(!evidence.priorityText.includes('Missing main heading'))
    throw Error('Expected no-H1 static finding not present in prioritized report');
   if(!evidence.reportSite?.includes(target.origin))
    throw Error('QA report website does not match inspected origin');
   const requestTypes=await page.evaluate(()=>window.__qaWorkflowRequests);
   attempt.requestCounts={
    discovery:requestTypes.filter(x=>x==='MICIRQL_DISCOVER').length,
    html:requestTypes.filter(x=>x==='MICIRQL_SEO_READ').length,
    layout:requestTypes.filter(x=>x==='MICIRQL_QA_LAYOUT').length
   };
   if(attempt.requestCounts.discovery!==1||attempt.requestCounts.html!==3||attempt.requestCounts.layout!==3)
    throw Error('Unexpected extension protocol request counts: '+JSON.stringify(attempt.requestCounts));
   if(jsErrors.length)throw Error('QA frontend JavaScript error: '+jsErrors.join('; ').slice(0,200));
   await page.emulateMedia({media:'print'});
   const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
   if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Browser did not create a valid PDF');
   const path=resolve(out,'live-three-page.pdf');
   await mkdir(out,{recursive:true});await writeFile(path,pdf);
   const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});
   const printed=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
   const count=Number(info.match(/^Pages:\s*(\d+)/m)?.[1]);
   if(!Number.isInteger(count)||count<1||count>12||!/^Page size:.*\(A4\)/m.test(info))
    throw Error('Printable document has invalid page count or A4 size');
   for(const required of ['What needs attention first','Missing main heading','Detailed HTML findings by page',
     '/links/3/0','/links/3/1','/links/3/2']){
    if(!printed.includes(required))throw Error('PDF text missing '+required);
   }
   attempt.status='verified';
   attempt.pdfPages=count;
   attempt.pdfBytes=pdf.length;
   result.status='verified';
   result.website=target.url;
   result.checkedPages=3;result.layoutPages=3;result.pdfPages=count;
   result.pdf='live-three-page.pdf';
   break;
  }catch(error){
   attempt.status='unverified';
   attempt.note=String(error?.message||error).slice(0,950);
   // Another public test domain can still be tried if this one blocks CI.
   // Close no website forms; the QA app is the only tab we interact with.
   if(await page.locator('#results').isVisible().catch(()=>false)){
    // Restore UI for a fresh URL without carrying over previous evidence.
    await page.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
    await page.waitForFunction(()=>document.querySelector('#extension-status')?.dataset?.state==='ready',
      null,{timeout:15000}).catch(()=>{});
    await page.evaluate(()=>{window.__qaWorkflowRequests=[]}).catch(()=>{});
   }
  }
 }
 await page.close();
}catch(error){result.error=String(error?.message||error).slice(0,650)}
finally{
 if(browser)await browser.close().catch(()=>{});
 await rm(profile,{recursive:true,force:true}).catch(()=>{});
 await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'workflow-results.json'),JSON.stringify(result,null,2));
 console.log('QA LIVE WORKFLOW '+JSON.stringify(result));
}
if(process.argv.includes('--strict')&&result.status!=='verified')process.exitCode=1;
