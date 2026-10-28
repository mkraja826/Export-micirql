import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';

const root=resolve('public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=resolve(root,'.'+pathname);
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return}
  const file=pathname.endsWith('/')?resolve(path,'index.html'):path;
  const body=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});
  res.end(body);
 }catch(error){if(!res.headersSent)res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
 for(const width of [375,768]){
  const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   const nativeScroll=Element.prototype.scrollIntoView;
   Element.prototype.scrollIntoView=function(options){
    (window.__seoScrollCalls??=[]).push({id:this.id,behavior:options?.behavior});
    return nativeScroll.call(this,options);
   };
  });
  const response=await page.goto('http://127.0.0.1:'+server.address().port+'/tools/seo/');
  if(!response?.ok())throw Error(width+': SEO fixture did not load (HTTP '+response?.status()+')');
  await page.locator('#site-demo').click();
  await page.locator('#site-fix-dashboard').waitFor();
  const plannedFilter=page.getByRole('button',{name:'View planned SEO repairs'});
  const detectedFilter=page.getByRole('button',{name:'View still detected SEO repairs'});
  if(await plannedFilter.getAttribute('aria-pressed')!=='true')throw Error(width+': empty tracker should default to Planned');
  await detectedFilter.click();
  if(await detectedFilter.getAttribute('aria-pressed')!=='true'||await plannedFilter.getAttribute('aria-pressed')!=='false')throw Error(width+': repair filter selection not reflected accessibly');
  if(!await page.locator('#seo-filtered-repairs h4').evaluate(el=>el===document.activeElement))throw Error(width+': repair task heading did not receive keyboard focus');
  const repairScroll=await page.evaluate(()=>window.__seoScrollCalls?.find(call=>call.id==='seo-filtered-repairs'));
  if(repairScroll?.behavior!=='auto')throw Error(width+': reduced-motion repair navigation should scroll without animation');
  const guide=page.locator('#site-fix-dashboard .repair-verification-help');
  await guide.getByRole('button',{name:'Go to website audit'}).click();
  if(!await page.locator('#site-url').evaluate(el=>el===document.activeElement))throw Error(width+': URL field did not receive focus');
  const measurements=await guide.evaluate(el=>({width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,viewport:window.innerWidth,buttonHeight:el.querySelector('button').getBoundingClientRect().height}));
  if(measurements.right>width+2||measurements.buttonHeight<44)throw Error(width+': guide overflow or undersized button '+JSON.stringify(measurements));
  const firstIssue=page.locator('#site-issues details.finding').first();
  await firstIssue.locator(':scope > summary').click();
  await firstIssue.locator('details.seo-guided-fix > summary').click();
  await firstIssue.locator('details.seo-guided-fix > details > summary').click();
  await firstIssue.getByRole('button',{name:'Planning a fix'}).first().click();
  await page.getByRole('button',{name:'View planned SEO repairs'}).click();
  await page.locator('#seo-filtered-repairs .repair-guide-link').first().click();
  const openedIssue=page.locator('#site-issues details.finding').first();
  if(!await openedIssue.evaluate(el=>el.open&&el.querySelector(':scope > summary')===document.activeElement&&el.querySelector('details.seo-guided-fix')?.open))throw Error(width+': guided repair navigation did not open and focus the matching issue');
  const highlightedPage=openedIssue.locator('details.seo-guided-fix li.is-target-repair');
  if(await highlightedPage.count()!==1||!await highlightedPage.locator('.repair-target-label').isVisible())throw Error(width+': tracked page was not highlighted within the issue guide');
  if(!await openedIssue.locator('details.seo-guided-fix > details').evaluate(el=>el.open))throw Error(width+': affected-page details were not expanded');
  const backButton=openedIssue.getByRole('button',{name:'Back to repair tasks'});
  if(await backButton.evaluate(el=>el.getBoundingClientRect().height)<44)throw Error(width+': back button touch target is undersized');
  await backButton.click();
  if(!await page.locator('#seo-filtered-repairs h4').evaluate(el=>el===document.activeElement))throw Error(width+': back navigation failed to focus repair task heading');
  if(errors.length)throw Error(width+': script error '+errors.join('; '));
  console.log('Mobile SEO QA '+width+'px passed: focus, guide fit, button target, exact issue-and-page navigation, accessible back action, no page errors');
  await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
