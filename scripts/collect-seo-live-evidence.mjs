// Read-only real-site evidence capture through the shipped SEO Studio and Chrome extension.
// Captures actual non-demo site-audit JSON. Does NOT create ground-truth labels or assert accuracy.
import {chromium} from 'playwright';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,extname} from 'node:path';
import {createSeoReviewQueue} from '../src/seo-review-queue.js';

const targets=[
 {name:'httpbin',url:'https://httpbin.org/links/3/0'},
 {name:'httpbingo',url:'https://httpbingo.org/links/3/0'}
];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json'};
const siteRoot=resolve('public'),extension=resolve('extension');
const out=resolve('dist/seo-live-evidence');
const summary={schemaVersion:'micirql-seo-live-evidence-v1',capturedAt:new Date().toISOString(),
 mode:'read_only_public_demo_sites',status:'unverified',attempts:[],
 independentGroundTruth:false,accuracyClaimPermitted:false,
 caveat:'These are real non-demo MiCirql browser audits, not independent labels. No accuracy scores can be claimed.'};
await mkdir(out,{recursive:true});
const profile=await mkdtemp(resolve(tmpdir(),'micirql-seo-live-evidence-'));
let browser;
try{
 browser=await chromium.launchPersistentContext(profile,{
  channel:'chromium',headless:true,acceptDownloads:true,
  args:['--disable-extensions-except='+extension,'--load-extension='+extension]
 });
 browser.setDefaultTimeout(15000);
 // Route only the first-party SEO Studio assets to the repository checkout;
 // the Chrome extension still visits and inspects the real external website.
 await browser.route('https://tools.micirql.com/tools/seo/**',async route=>{
  try{
   const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
   const file=resolve(siteRoot,'.'+pathname);
   if(file!==siteRoot&&!file.startsWith(siteRoot+sep))throw Error('Unsafe local asset path');
   const local=pathname.endsWith('/')?resolve(file,'index.html'):file;
   await route.fulfill({status:200,body:await readFile(local),
    contentType:types[extname(local)]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:'Asset unavailable'})}
 });
 const page=await browser.newPage();
 page.setDefaultNavigationTimeout(25000);
 const errors=[];
 page.on('pageerror',err=>errors.push(String(err?.message||err).slice(0,220)));
 for(const target of targets){
  const attempt={name:target.name,url:target.url,status:'unverified'};
  summary.attempts.push(attempt);
  try{
   await page.goto('https://tools.micirql.com/tools/seo/',{waitUntil:'domcontentloaded',timeout:25000});
   await page.waitForFunction(()=>document.querySelector('#extension-status')?.dataset.connected==='yes',null,{timeout:20000});
   // The normal PDF-first UI intentionally hides JSON export and the page limit.
   // Enable the existing developer switch only in this isolated QA browser.
   await page.locator('#seo-advanced-controls > summary').click();
   await page.locator('#developer-mode-toggle').click();
   if(!await page.locator('body').evaluate(el=>el.classList.contains('developer-mode')))
    throw Error('Could not enable the existing developer controls for evidence export');
   await page.locator('#site-url').fill(target.url);
   await page.locator('#site-limit').selectOption('10');
   await page.locator('#site-run').click();
   await page.waitForFunction(()=>{
    const button=document.querySelector('#site-export');
    return button&&button.disabled===false;
   },null,{timeout:145000});
   // A report can finish before bounded background link checks do. Never
   // silently call unverified link observations successful.
   await page.waitForFunction(()=>document.querySelector('#site-export-pdf')?.disabled===false,
    null,{timeout:15000}).catch(()=>{});
   const [download]=await Promise.all([
    page.waitForEvent('download',{timeout:20000}),
    page.locator('#site-export').click()
   ]);
   const path=resolve(out,target.name+'-audit.json');
   await download.saveAs(path);
   const audit=JSON.parse(await readFile(path,'utf8'));
   const origin=new URL(target.url).origin;
   if(audit?.tool!=='seo-site'||audit?.demo!==false||audit?.website!==origin||
    !Array.isArray(audit.reports)||!Array.isArray(audit.issueCenter)||
    !Number.isFinite(Date.parse(audit.generatedAt))||audit.reports.length===0)
    throw Error('Downloaded JSON is not a valid real SEO Studio audit for the requested origin');
   const complete=audit.reports.filter(p=>p.auditStatus==='complete'&&p.partial!==true&&
    (p.pageRole||'public')==='public').length;
   if(!complete)throw Error('Downloaded site audit had no complete public-page observations');
   const draft=createSeoReviewQueue(audit,{maxCases:60});
   const reviewPath=resolve(out,target.name+'-unreviewed-queue.json');
   await writeFile(reviewPath,JSON.stringify(draft,null,2)+'\n','utf8');
   attempt.status='captured_unreviewed';
   attempt.auditFile=target.name+'-audit.json';
   attempt.reviewQueueFile=target.name+'-unreviewed-queue.json';
   attempt.auditGeneratedAt=audit.generatedAt;
   attempt.scoringVersion=audit.scoringVersion||null;
   attempt.reportedPages=audit.reports.length;
   attempt.completePublicPages=complete;
   attempt.reportedIssueCodes=[...new Set(audit.issueCenter.map(x=>x.code).filter(Boolean))].length;
   attempt.reviewCandidates=draft.selectedCount;
   attempt.linkVerificationPending=audit.linkVerificationPending===true;
   attempt.caution='Review queue contains no ground truth; no precision or recall estimate is permitted.';
   summary.status='captured_unreviewed';
   summary.capturedWebsite=origin;
   break; // One successful first-party end-to-end export is this smoke test's scope.
  }catch(error){
   attempt.note=String(error?.message||error).slice(0,500);
  }
 }
 summary.browserErrors=errors.slice(0,5);
 await page.close();
}catch(error){summary.error=String(error?.message||error).slice(0,550)}
finally{
 if(browser)await browser.close().catch(()=>{});
 await rm(profile,{recursive:true,force:true}).catch(()=>{});
 await writeFile(resolve(out,'summary.json'),JSON.stringify(summary,null,2)+'\n','utf8');
 console.log('SEO REAL-SITE EVIDENCE '+JSON.stringify(summary));
}
if(process.argv.includes('--strict')&&summary.status!=='captured_unreviewed')process.exitCode=1;
