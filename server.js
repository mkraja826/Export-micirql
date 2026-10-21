import express from 'express';
import { chromium } from 'playwright';
import archiver from 'archiver';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(express.json({limit:'16kb'}));
app.use(express.static('public'));
const PORT = Number(process.env.PORT || 3000);
const PRESETS = Object.freeze([
  {width:320,height:720,name:'Small mobile'},
  {width:375,height:812,name:'Mobile'},
  {width:430,height:932,name:'Large mobile'},
  {width:768,height:1024,name:'Tablet portrait'},
  {width:1024,height:768,name:'Tablet landscape'},
  {width:1440,height:900,name:'Desktop'},
  {width:1920,height:1080,name:'Full HD'},
  {width:3840,height:2160,name:'4K'}
]);
const jobs = new Map();
const MAX_JOBS = 20;
function privateIP(ip) {
  if (ip.includes(':')) {
    const s=ip.toLowerCase();
    return s==='::1'||s==='::'||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('fe8')||s.startsWith('fe9')||s.startsWith('fea')||s.startsWith('feb')||s.startsWith('::ffff:');
  }
  const n=ip.split('.').map(Number);
  return n[0]===0||n[0]===10||n[0]===127||n[0]>=224||
    (n[0]===169&&n[1]===254)||(n[0]===172&&n[1]>=16&&n[1]<=31)||
    (n[0]===192&&n[1]===168)||(n[0]===100&&n[1]>=64&&n[1]<=127)||
    (n[0]===192&&n[1]===0)||(n[0]===198&&(n[1]===18||n[1]===19));
}
async function validateTarget(raw) {
  if (typeof raw!=='string'||raw.length>2048) throw Error('Invalid URL');
  const u=new URL(raw.includes('://')?raw:'https://'+raw);
  if (!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname) throw Error('Only public HTTP(S) URLs are allowed');
  if (u.port && !['80','443'].includes(u.port)) throw Error('Custom ports are not allowed');
  const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if (host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')) throw Error('Private host is not allowed');
  const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true});
  if (!addresses.length||addresses.some(x=>privateIP(x.address))) throw Error('Private network targets are not allowed');
  return u.toString();
}
app.get('/api/presets',(_req,res)=>res.json(PRESETS));
app.post('/api/capture',async(req,res)=>{
  try {
    const url=await validateTarget(req.body.url);
    const widths=req.body.widths;
    const format=req.body.format;
    if (!Array.isArray(widths)||!widths.length||widths.length>8||new Set(widths).size!==widths.length||widths.some(w=>!PRESETS.some(p=>p.width===w))) throw Error('Select valid unique viewport widths');
    if (!['jpg','png'].includes(format)) throw Error('Choose jpg or png');
    if (jobs.size>=MAX_JOBS) throw Error('Server busy; try again shortly');
    const id=randomUUID();
    jobs.set(id,{status:'running',created:Date.now(),results:[],error:null});
    res.status(202).json({id});
    capture(id,url,widths,format).catch(e=>{const j=jobs.get(id);if(j){j.error=e.message;j.status='failed';}});
  } catch(e){res.status(400).json({error:e.message});}
});
async function capture(id,url,widths,format) {
  const job=jobs.get(id);
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    for(const width of widths){
      const preset=PRESETS.find(p=>p.width===width);
      const context=await browser.newContext({viewport:{width,height:preset.height},deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:false});
      try{
        const page=await context.newPage();
        page.setDefaultTimeout(20000);
        await page.route('**/*',async route=>{
          try {await validateTarget(route.request().url());await route.continue();}
          catch {await route.abort();}
        });
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForTimeout(1200);
        // Scroll down to trigger common lazy-loaded content before full-page capture.
        await page.evaluate(async()=>{
          const limit=Math.min(document.documentElement.scrollHeight,30000);
          for(let y=0;y<limit;y+=800){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,70));}
          window.scrollTo(0,0);
        });
        const bytes=await page.screenshot({type:format==='jpg'?'jpeg':'png',quality:format==='jpg'?85:undefined,fullPage:true,animations:'disabled',timeout:45000});
        job.results.push({width,filename:'export-micirql-'+width+'px.'+format,bytes});
      }catch(e){job.results.push({width,error:e.message});}
      finally{await context.close();}
    }
    job.status='done';
  } finally {await browser.close();}
}
app.get('/api/jobs/:id',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j)return res.status(404).json({error:'Job not found'});
  res.json({status:j.status,error:j.error,results:j.results.map(({width,filename,error})=>({width,filename,error,download:filename?'/api/jobs/'+req.params.id+'/files/'+width:null}))});
});
app.get('/api/jobs/:id/files/:width',(req,res)=>{
  const j=jobs.get(req.params.id),item=j?.results.find(x=>x.width===Number(req.params.width));
  if(!item?.bytes)return res.sendStatus(404);
  res.set({'Content-Type':item.filename.endsWith('.png')?'image/png':'image/jpeg','Content-Disposition':'attachment; filename="'+item.filename+'"','Cache-Control':'no-store'}).send(item.bytes);
});
app.get('/api/jobs/:id/zip',(req,res)=>{
  const j=jobs.get(req.params.id);
  if(!j||j.status!=='done')return res.sendStatus(404);
  res.set({'Content-Type':'application/zip','Content-Disposition':'attachment; filename="export-micirql.zip"','Cache-Control':'no-store'});
  const zip=archiver('zip',{zlib:{level:6}});
  zip.on('error',()=>res.destroy());
  zip.pipe(res);
  for(const item of j.results)if(item.bytes)zip.append(item.bytes,{name:item.filename});
  zip.finalize();
});
setInterval(()=>{for(const [id,j] of jobs)if(j.status!=='running'&&Date.now()-j.created>15*60_000)jobs.delete(id);},60_000).unref();
app.listen(PORT,()=>console.log('Export Micirql listening on '+PORT));
