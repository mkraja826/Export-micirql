// Real Chromium print-to-PDF regression for QA Lab.
// Uses local synthetic websites and mock Chrome extension responses.
// No network calls to user websites and no form interactions.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {extname,resolve,sep} from 'node:path';

const root=resolve('public');
const output=resolve('dist/qa-pdf-fixtures');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const requested=resolve(root,'.'+pathname);
  if(requested!==root&&!requested.startsWith(root+sep)){res.writeHead(403).end();return}
  const file=pathname.endsWith('/')?resolve(requested,'index.html'):requested;
  const body=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});
  res.end(body);
 }catch{if(!res.headersSent)res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});

function check(condition,message){if(!condition)throw Error(message)}
function pdfPageCount(pdf){
 // Chromium emits an explicit /Type /Page dictionary for each printable PDF page.
 return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
}
async function runCase({name,count,partial,failed,discoveryErrors=0,discoveryFailure=''}){
 const page=await browser.newPage({viewport:{width:1100,height:850},locale:'en-US',reducedMotion:'reduce'});
 const consoleErrors=[];
 page.on('pageerror',error=>consoleErrors.push(error.message));
 const urls=Array.from({length:count},(_,i)=>i===0?'https://qa-fixture.example/':
  'https://qa-fixture.example/'+(i===1?'contact-and-booking-form':i===2?'about-us-and-our-services':'service-'+String(i).padStart(2,'0'))+(i===3?'-very-long-page-name-to-check-that-urls-wrap-without-clipping-into-the-paper-margin':''));
 await page.addInitScript(({urls,partial,failed})=>{
  const answer=(request,type,fields={})=>setTimeout(()=>window.postMessage({
   source:'micirql-extension',type,id:request.id,...fields
  },location.origin),0);
  const htmlFor=index=>{
   const form=index===1||index%3===0?
    '<form><input id="customer-email"><button type="button"><svg aria-hidden="true"></svg></button><button type="submit">Send</button></form>':'';
   const image=index%2===0?'<img src="/image-'+index+'.jpg">':'';
   const links=index%4===0?'<a href="#">Read details</a><a href="https://third-party.test/" target="_blank">New tab</a>':'';
   const id=index%5===0?'<div id="duplicate">One</div><div id="duplicate">Two</div>':'';
   const heading=index%7===0?'':'<h1>Our services</h1>';
   return '<!doctype html><html lang="en"><head><title>MiCirql synthetic QA report</title></head>'+
    '<body>'+heading+'<main>'+form+image+links+id+
    '<p>Public synthetic QA fixture '+index+'. This text is not private customer information.</p></main></body></html>';
  };
  window.__qaMockRequests=[];
  window.addEventListener('message',event=>{
   const request=event.data;
   if(event.source!==window||request?.source!=='micirql-web')return;
   window.__qaMockRequests.push(request.type);
   if(request.type==='MICIRQL_EXTENSION_PING'){
    answer(request,'MICIRQL_EXTENSION_READY',{protocol:3,capabilities:['discover','seo-http-evidence','qa-layout'],extensionVersion:'0.3.17'});
   }else if(request.type==='MICIRQL_DISCOVER'){
    if(discoveryFailure){
     answer(request,'MICIRQL_DISCOVER_RESULT',{ok:false,error:discoveryFailure,pages:[],scanned:0});
     return;
    }
    const reachable=urls.slice(0,urls.length-discoveryErrors);
    const unreachable=urls.slice(urls.length-discoveryErrors);
    answer(request,'MICIRQL_DISCOVER_RESULT',{ok:true,pages:reachable,
     scanned:urls.length,originalCount:urls.length,truncated:urls.length>=60,
     errors:unreachable.map(url=>({url,message:'Simulated discovery timeout'}))});
   }else if(request.type==='MICIRQL_SEO_READ'){
    const index=urls.indexOf(request.url);
    if(index<0){answer(request,'MICIRQL_SEO_RESULT',{ok:false,error:'Not in fixture'});return}
    if(index>=urls.length-failed){answer(request,'MICIRQL_SEO_RESULT',{ok:false,error:'Simulated capture failure'});return}
    answer(request,'MICIRQL_SEO_RESULT',{ok:true,url:request.url,partial:index>=urls.length-failed-partial,html:htmlFor(index)});
   }else if(request.type==='MICIRQL_QA_LAYOUT'){
    const index=urls.indexOf(request.url);
    answer(request,'MICIRQL_QA_LAYOUT_RESULT',{ok:true,url:request.url,observations:[375,768,1440].map(width=>{
     if(width===768&&index===2)return {width,verified:false,reason:'Simulated viewport failure'};
     return {width,verified:true,observedWidth:width,documentWidth:width+((index+width)%4===0?12:0),
      horizontalOverflowPx:(index+width)%4===0?12:0,visibleFormControls:index===1?2:0,
      unlabelledVisibleFields:index===1?1:0,navigationLinks:8,unnamedNavigationLinks:1,
      placeholderNavigationLinks:2,scriptedNavigationLinks:0,missingNavigationFragmentTargets:1,
      requiredVisibleFields:2,implicitSubmitButtons:1,buttonsWithoutNames:1,
      customControlsWithoutTabFocus:1,navigationWithoutTabFocus:0,requiredFieldsWithoutLabels:1,smallNavigationTargets:2};
    })});
   }
  });
 },{urls,partial,failed,discoveryErrors,discoveryFailure});
 try{
  const response=await page.goto(base+'/tools/qa/',{waitUntil:'networkidle'});
  check(response?.ok(),name+': QA Lab route failed');
  // Exercise the production UI's compatibility contract, not only pure helper tests.
  if(name==='small-complete'){
   await page.evaluate(()=>window.postMessage({source:'micirql-extension',type:'MICIRQL_EXTENSION_READY',
    protocol:3,extensionVersion:'0.3.16',capabilities:['discover','seo-http-evidence','qa-layout']},location.origin));
   await page.waitForFunction(()=>document.getElementById('extension-status')?.dataset?.state==='limited',null,{timeout:4000});
   check(await page.locator('#setup').isVisible(),name+': update guidance must be visible for older extension');
   await page.evaluate(()=>window.postMessage({source:'micirql-extension',type:'MICIRQL_EXTENSION_READY',
    protocol:3,extensionVersion:'0.3.17',capabilities:['discover','seo-http-evidence','qa-layout']},location.origin));
  }
  await page.waitForFunction(()=>document.getElementById('extension-status')?.dataset?.state==='ready',null,{timeout:5000});
  await page.locator('#url').fill('https://qa-fixture.example/');
  await page.locator('#run').click();
  await page.locator('#results').waitFor({state:'visible',timeout:60000});
  check((await page.locator('#progress').evaluate(el=>el.value))===100,name+': incomplete progress');
  const selected=count-discoveryErrors;
  check((await page.locator('#pages > details').count())===selected,name+': page listing count mismatch');
  const complete=selected-partial-failed;
  const metrics=await page.locator('#metrics .metric strong').allTextContents();
  check(Number(metrics[0])===complete,name+': complete HTML pages counted incorrectly: '+JSON.stringify(metrics));
  check(Number(metrics[2])===partial+failed,name+': unverified HTML pages counted incorrectly');
  check((await page.locator('#discovery-errors > details').count())===discoveryErrors,
   name+': unreachable discovery URLs were not listed separately');
  const discoveryText=await page.locator('#discovery-summary').textContent();
  if(discoveryErrors){
   check(discoveryText.includes(discoveryErrors+' URL(s) not reached'),name+': missing discovery failure count');
   check(discoveryText.includes('Crawl coverage is incomplete'),name+': missing discovery coverage warning');
  }
  if(discoveryFailure){
   check(discoveryText.includes(discoveryFailure),name+': discovery error reason not visible in report');
   check((await page.locator('#priority-count').textContent()).includes('No complete HTML snapshots'),
    name+': failed discovery wrongly looks like a healthy audit');
  }
  check((await page.locator('#priority-section').isVisible()),name+': priority section hidden');
  const priority=await page.locator('#priority-count').textContent();
  check(priority.includes('complete HTML')||priority.includes('complete page'),name+': priorities not tied to complete HTML evidence');
  const uncertain=await page.locator('#provisional-summary').textContent();
  if(partial||failed)check(uncertain.includes(partial+' partial HTML')&&uncertain.includes(failed+' failed page'),name+': missing unverified coverage warning');
  const layouts=await page.locator('#layout-details > details').count();
  check(layouts===Math.min(3,complete),name+': wrong sampled layout page count');
  check(await page.locator('#results').evaluate(el=>el.scrollWidth<=el.clientWidth+4),name+': report overflow on desktop');
  await page.emulateMedia({media:'print'});
  check((await page.locator('nav').evaluate(el=>getComputedStyle(el).display))==='none',name+': navigation included in print');
  check((await page.locator('#advanced').evaluate(el=>getComputedStyle(el).display))==='none',name+': developer mode included in print');
  check((await page.locator('#priority-section').evaluate(el=>getComputedStyle(el).display))!=='none',name+': priority section omitted from print');
  await mkdir(output,{recursive:true});
  const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  check(pdf.subarray(0,5).toString()==='%PDF-',name+': Chromium did not generate a PDF');
  const pages=pdfPageCount(pdf);
  check(pages>=1&&pages<=Math.max(8,Math.ceil(count*1.4)),name+': implausible PDF page count '+pages);
  // Guard against a return to the oversized 7/24-page reports from the initial print layout.
  check(pages<=(count>=60?20:6),name+': printable report regressed to '+pages+' pages');
  check(pdf.length>9000&&pdf.length<12_000_000,name+': unexpected PDF size '+pdf.length);
  check((await page.locator('#pages details:not([open])').count())===selected,
   name+': print expansion did not restore the original collapsed page groups');
  const requests=await page.evaluate(()=>window.__qaMockRequests);
  check(requests.filter(x=>x==='MICIRQL_SEO_READ').length===selected,name+': request count differed from selected pages');
  check(requests.filter(x=>x==='MICIRQL_QA_LAYOUT').length===Math.min(3,complete),
   name+': viewports were observed on more pages than stated in the report');
  check(!consoleErrors.length,name+': page JavaScript errors: '+consoleErrors.join('; '));
  const pdfPath=resolve(output,name+'.pdf');
  await writeFile(pdfPath,pdf);
  // Inspect the actual PDF bytes and extracted text, not just the browser DOM.
  const info=execFileSync('pdfinfo',[pdfPath],{encoding:'utf8'});
  const reportedPages=Number(info.match(/^Pages:\s*(\d+)/m)?.[1]);
  check(reportedPages===pages,name+': pdfinfo page count differs from Chromium structure');
  check(/^Page size:.*\(A4\)/m.test(info),name+': PDF does not use A4 paper size');
  const printedText=execFileSync('pdftotext',['-layout',pdfPath,'-'],{encoding:'utf8',maxBuffer:15_000_000});
  for(const heading of ['What needs attention first','Browser-observed layout','Detailed HTML findings by page']){
   check(printedText.includes(heading),name+': actual PDF is missing the printed '+heading+' section');
  }
  check(printedText.includes('qa-fixture.example'),name+': actual PDF omitted the tested website');
  if(partial||failed){
   check(printedText.includes('Not verified'),name+': actual PDF omitted unverified HTML evidence');
   check(printedText.includes('Simulated capture failure'),name+': actual PDF omitted failed page reason');
  }
  if(discoveryErrors){
   check(printedText.includes('Crawl discovery coverage'),name+': actual PDF omitted discovery section');
   check(printedText.includes('Simulated discovery timeout'),name+': PDF omitted failed discovery URL and reason');
   check(printedText.includes('/service-04'),name+': PDF omitted unreachable discovery URL');
  }
  if(discoveryFailure)
   check(printedText.includes(discoveryFailure),name+': zero-page failed crawl PDF omitted discovery error');
  const finalText=execFileSync('pdftotext',['-f',String(pages),'-l',String(pages),pdfPath,'-'],
   {encoding:'utf8',maxBuffer:1_000_000});
  check(finalText.trim().length>90,name+': last A4 PDF page is blank or contains too little readable content');
  // First and final page renders are uploaded with the PDFs for manual visual review.
  execFileSync('pdftoppm',['-f','1','-l','1','-r','100','-png','-singlefile',pdfPath,
   resolve(output,name+'-first')],{stdio:'ignore'});
  execFileSync('pdftoppm',['-f',String(pages),'-l',String(pages),'-r','100','-png','-singlefile',
   pdfPath,resolve(output,name+'-last')],{stdio:'ignore'});
  console.log('QA PDF '+name+' passed: '+complete+' complete, '+partial+' partial, '+failed+' failed HTML pages; '+
   layouts+' layout pages; '+pages+' verified A4 PDF pages; '+pdf.length+' bytes, PDF text and first/last page renders checked');
 }finally{await page.close()}
}
try{
 await runCase({name:'small-complete',count:4,partial:0,failed:0});
 await runCase({name:'large-60-pages',count:60,partial:2,failed:2});
 await runCase({name:'discovery-gaps',count:6,partial:0,failed:1,discoveryErrors:2});
 await runCase({name:'discovery-zero',count:0,partial:0,failed:0,discoveryFailure:'Chrome discovery timed out'});
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
