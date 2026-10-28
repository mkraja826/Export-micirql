import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';

const root=resolve('public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return}
  const file=path.endsWith(sep)?path+'index.html':path;
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/tools/seo/');
  await page.getByRole('button',{name:/Try sample audit/i}).click();
  await page.locator('#site-fix-dashboard').waitFor();
  const guide=page.locator('#site-fix-dashboard .repair-verification-help');
  await guide.getByRole('button',{name:'Go to website audit'}).click();
  if(!await page.locator('#site-url').evaluate(el=>el===document.activeElement))throw Error(width+': URL field did not receive focus');
  const measurements=await guide.evaluate(el=>({width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right,viewport:window.innerWidth,buttonHeight:el.querySelector('button').getBoundingClientRect().height}));
  if(measurements.right>width+2||measurements.buttonHeight<44)throw Error(width+': guide overflow or undersized button '+JSON.stringify(measurements));
  if(errors.length)throw Error(width+': script error '+errors.join('; '));
  console.log('Mobile SEO QA '+width+'px passed: focus, guide fit, button target, no page errors');
  await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
