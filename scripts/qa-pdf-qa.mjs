// Real Chromium print-to-PDF regression for QA Lab.
// Uses local synthetic websites and mock Chrome extension responses.
// No network calls to user websites and no form interactions.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
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
async function runCase({name,count,partial,failed}){
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
    answer(request,'MICIRQL_EXTENSION_READY',{protocol:3,capabilities:['qa-layout'],extensionVersion:'fixture'});
   }else if(request.type==='MICIRQL_DISCOVER'){
    answer(request,'MICIRQL_DISCOVER_RESULT',{ok:true,pages:urls,originalCount:urls.length+1,truncated:urls.length>=60});
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
 },{urls,partial,failed});
 try{
  const response=await page.goto(base+'/tools/qa/',{waitUntil:'networkidle'});
  check(response?.ok(),name+': QA Lab route failed');
  await page.locator('#url').fill('https://qa-fixture.example/');
  await page.locator('#run').click();
  await page.locator('#results').waitFor({state:'visible',timeout:60000});
  check((await page.locator('#progress').evaluate(el=>el.value))===100,name+': incomplete progress');
  check((await page.locator('#pages > details').count())===count,name+': page listing count mismatch');
  const complete=count-partial-failed;
  const metrics=await page.locator('#metrics .metric strong').allTextContents();
  check(Number(metrics[0])===complete,name+': complete HTML pages counted incorrectly: '+JSON.stringify(metrics));
  check(Number(metrics[2])===partial+failed,name+': unverified HTML pages counted incorrectly');
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
  check(pdf.length>9000&&pdf.length<12_000_000,name+': unexpected PDF size '+pdf.length);
  check((await page.locator('#pages details:not([open])').count())===count,
   name+': print expansion did not restore the original collapsed page groups');
  const requests=await page.evaluate(()=>window.__qaMockRequests);
  check(requests.filter(x=>x==='MICIRQL_SEO_READ').length===count,name+': request count differed from page cap');
  check(requests.filter(x=>x==='MICIRQL_QA_LAYOUT').length===Math.min(3,complete),
   name+': viewports were observed on more pages than stated in the report');
  check(!consoleErrors.length,name+': page JavaScript errors: '+consoleErrors.join('; '));
  await writeFile(resolve(output,name+'.pdf'),pdf);
  console.log('QA PDF '+name+' passed: '+complete+' complete, '+partial+' partial, '+failed+' failed HTML pages; '+
   layouts+' layout pages; '+pages+' printable A4 PDF pages; '+pdf.length+' bytes');
 }finally{await page.close()}
}
try{
 await runCase({name:'small-complete',count:4,partial:0,failed:0});
 await runCase({name:'large-60-pages',count:60,partial:2,failed:2});
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
