const PRESETS=[{width:320,height:720,name:'Small mobile'},{width:375,height:812,name:'Mobile'},{width:430,height:932,name:'Large mobile'},{width:768,height:1024,name:'Tablet portrait'},{width:1024,height:768,name:'Tablet landscape'},{width:1440,height:900,name:'Desktop'},{width:1920,height:1080,name:'Full HD'},{width:3840,height:2160,name:'4K'}];
function publicUrl(input){
 if(typeof input!=='string'||input.length>2048)throw Error('Invalid URL');
 const u=new URL(input);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error('Only public HTTP(S) websites are allowed');
 const h=u.hostname.toLowerCase();
 if(h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.localhost')||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(':'))throw Error('Use a public domain name');
 return u.href;
}
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/presets')return json(PRESETS);
  if(path==='/api/screenshot'&&request.method==='POST'){
   try{
    const body=await request.json();
    const url=publicUrl(body.url);
    const preset=PRESETS.find(p=>p.width===body.width);
    if(!preset)throw Error('Unsupported width');
    if(!['png','jpg'].includes(body.format))throw Error('Unsupported format');
    const result=await env.BROWSER.quickAction('screenshot',{
     url,
     viewport:{width:preset.width,height:preset.height,deviceScaleFactor:1},
     screenshotOptions:{fullPage:true,type:body.format==='jpg'?'jpeg':'png',quality:body.format==='jpg'?85:undefined},
     gotoOptions:{waitUntil:'domcontentloaded',timeout:30000},
     waitForTimeout:1200
    });
    if(!result.ok)return json({error:'Screenshot service failed',status:result.status},502);
    return new Response(result.body,{headers:{'content-type':body.format==='jpg'?'image/jpeg':'image/png','content-disposition':'attachment; filename="export-micirql-'+preset.width+'px.'+body.format+'"','cache-control':'no-store'}});
   }catch(e){return json({error:e.message||'Invalid request'},400);}
  }
  if(path.startsWith('/api/'))return json({error:'Not found'},404);
  return env.ASSETS.fetch(request);
 }
};
