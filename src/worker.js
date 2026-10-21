import {getCatalog} from './tool-registry.js';
const PRESETS=[{width:375,height:812,name:'Mobile'},{width:768,height:1024,name:'Tablet'},{width:1440,height:900,name:'Desktop'}];
function publicUrl(input){
 if(typeof input!=='string'||input.length>2048)throw Error('Invalid URL');
 const u=new URL(input);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error('Only public HTTP(S) websites are allowed');
 const h=u.hostname.toLowerCase();
 if(h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.localhost')||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(':'))throw Error('Use a public domain name');
 return u.href;
}
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{'cache-control':'no-store',...extra}});
const MCP_TOOLS=[
 {name:'discover_pages',description:'Discover internal website pages from homepage links and sitemap.',inputSchema:{type:'object',properties:{url:{type:'string',description:'Public website URL'}},required:['url'],additionalProperties:false}},
 {name:'capture_screenshot',description:'Capture one full-page website screenshot. Returns an image for visual inspection; use the website for bulk exports.',inputSchema:{type:'object',properties:{url:{type:'string'},width:{type:'integer',enum:[375,768,1440]},format:{type:'string',enum:['jpg','png'],default:'jpg'}},required:['url','width'],additionalProperties:false}},
 {name:'capture_responsive',description:'Capture a single public webpage at up to four selected viewport widths. Returns image blocks for each successful capture. Best for comparing mobile, tablet and desktop.',inputSchema:{type:'object',properties:{url:{type:'string'},widths:{type:'array',items:{type:'integer',enum:[375,768,1440]},minItems:1,maxItems:4,uniqueItems:true},format:{type:'string',enum:['jpg','png'],default:'jpg'}},required:['url','widths'],additionalProperties:false}},
 {name:'plan_website_capture',description:'Discover same-origin website pages and prepare a bounded screenshot capture plan. Planning does not run captures or create a ZIP.',inputSchema:{type:'object',properties:{url:{type:'string'},widths:{type:'array',items:{type:'integer',enum:[375,768,1440]},minItems:1,maxItems:8,uniqueItems:true},maxPages:{type:'integer',minimum:1,maximum:20}},required:['url','widths'],additionalProperties:false}},
 {name:'list_micirql_tools',description:'List MiCirql capabilities and their actual implementation status; planned tools are not executable.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'list_viewports',description:'List supported screenshot viewport sizes.',inputSchema:{type:'object',properties:{},additionalProperties:false}}
];
const rpc=(id,result)=>Response.json({jsonrpc:'2.0',id,result},{headers:{'cache-control':'no-store'}});
const rpcError=(id,code,message,status=200)=>Response.json({jsonrpc:'2.0',id,error:{code,message}},{status,headers:{'cache-control':'no-store'}});
async function mcp(request,env){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{allow:'POST'}});
 if(!env.MCP_API_TOKEN)return new Response('MCP not configured',{status:503});
 const auth=request.headers.get('authorization')||'';
 if(auth!==('Bearer '+env.MCP_API_TOKEN))return new Response('Unauthorized',{status:401,headers:{'www-authenticate':'Bearer realm="MiCirql MCP"'}});
 let msg;try{msg=await request.json()}catch{return rpcError(null,-32700,'Invalid JSON',400)}
 if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return rpcError(msg?.id??null,-32600,'Invalid request',400);
 if(msg.method==='notifications/initialized')return new Response(null,{status:202});
 const id=msg.id??null;
 if(msg.method==='initialize')return rpc(id,{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'micirql-export',version:'0.1.0'}});
 if(msg.method==='ping')return rpc(id,{});
 if(msg.method==='tools/list')return rpc(id,{tools:MCP_TOOLS});
 if(msg.method!=='tools/call')return rpcError(id,-32601,'Method not found');
 const name=msg.params?.name,args=msg.params?.arguments||{};
 if(!MCP_TOOLS.some(t=>t.name===name))return rpcError(id,-32602,'Unknown tool');
 try{
  if(name==='list_viewports')return rpc(id,{content:[{type:'text',text:JSON.stringify(PRESETS)}]});
  if(name==='list_micirql_tools')return rpc(id,{content:[{type:'text',text:JSON.stringify(getCatalog())}]});
  const origin=new URL(request.url).origin;
  if(name==='plan_website_capture'){
   const widths=args.widths,maxPages=args.maxPages??10;
   if(!Array.isArray(widths)||widths.length<1||widths.length>8||new Set(widths).size!==widths.length||widths.some(w=>!PRESETS.some(p=>p.width===w))||!Number.isInteger(maxPages)||maxPages<1||maxPages>20)throw Error('Invalid widths or maxPages');
   const home=publicUrl(args.url);
   const out=await exportHandler(new Request(origin+'/api/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:home})}),env);
   if(!out.ok)throw Error((await out.json()).error||'Page discovery failed');
   const discovered=await out.json(),pages=discovered.pages.slice(0,maxPages);
   const plan={website:home,pages,widths,totalCaptures:pages.length*widths.length,estimatedOnly:true,jobCreated:false,captures:pages.flatMap(p=>widths.map(width=>({url:p.url,width})))};
   return rpc(id,{content:[{type:'text',text:JSON.stringify(plan)}]});
  }
  if(name==='discover_pages'){
   const out=await exportHandler(new Request(origin+'/api/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:publicUrl(args.url)})}),env);
   if(!out.ok)throw Error((await out.json()).error||'Discovery failed');
   return rpc(id,{content:[{type:'text',text:JSON.stringify(await out.json())}]});
  }
  if(name==='capture_responsive'){
   const widths=args.widths,format=args.format||'jpg';
   if(!Array.isArray(widths)||widths.length<1||widths.length>4||new Set(widths).size!==widths.length||widths.some(w=>!PRESETS.some(p=>p.width===w))||!['jpg','png'].includes(format))throw Error('Choose 1 to 4 unique supported viewport widths');
   const url=publicUrl(args.url),content=[];
   for(const width of widths){
    try{
     const out=await exportHandler(new Request(origin+'/api/screenshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,width,format})}),env);
     if(!out.ok)throw Error((await out.json()).error||'Screenshot failed');
     const bytes=new Uint8Array(await out.arrayBuffer());
     if(bytes.length>6_000_000)throw Error('Image exceeds 6 MB limit');
     let encoded='';for(let i=0;i<bytes.length;i+=8192)encoded+=String.fromCharCode(...bytes.subarray(i,i+8192));
     content.push({type:'text',text:width+'px screenshot of '+url});
     content.push({type:'image',data:btoa(encoded),mimeType:format==='jpg'?'image/jpeg':'image/png'});
    }catch(e){content.push({type:'text',text:width+'px failed: '+(e.message||'Capture error')})}
   }
   return rpc(id,{content,isError:!content.some(c=>c.type==='image')});
  }
  if(name==='capture_screenshot'){
   const width=Number(args.width),format=args.format||'jpg';
   if(!PRESETS.some(p=>p.width===width)||!['jpg','png'].includes(format))throw Error('Invalid viewport or format');
   const out=await exportHandler(new Request(origin+'/api/screenshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:publicUrl(args.url),width,format})}),env);
   if(!out.ok)throw Error((await out.json()).error||'Screenshot failed');
   const bytes=new Uint8Array(await out.arrayBuffer());
   if(bytes.length>6_000_000)throw Error('Screenshot exceeds 6 MB MCP response limit; use the website to download the original');
   let encoded='';for(let i=0;i<bytes.length;i+=8192)encoded+=String.fromCharCode(...bytes.subarray(i,i+8192));
   return rpc(id,{content:[{type:'image',data:btoa(encoded),mimeType:format==='jpg'?'image/jpeg':'image/png'}]});
  }
 }catch(e){return rpc(id,{isError:true,content:[{type:'text',text:e.message||'Tool failed'}]})}
}

async function exportHandler(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/mcp')return mcp(request,env);
  if(path==='/api/health')return json({ok:true,service:'MiCirql Export',presets:PRESETS.length,browserConfigured:!!env.BROWSER});
  if(path==='/api/presets')return json(PRESETS);
  if(path==='/api/tools'&&request.method==='GET')return json(getCatalog());
  if(path==='/api/capture-readiness')return json({browserConfigured:!!env.BROWSER,service:'Cloudflare Browser Rendering',note:'Binding presence does not guarantee available quota or screenshot success.'});
  if(path==='/api/discover'&&request.method==='POST'){
   try{
    const body=await request.json(),home=new URL(publicUrl(body.url)),found=new Map();
    const add=(raw,label)=>{
     try{const u=new URL(raw,home);if(u.origin!==home.origin||!['http:','https:'].includes(u.protocol))return;
      u.hash='';u.search='';const ext=u.pathname.toLowerCase();
      if(/\.(jpg|jpeg|png|webp|gif|svg|pdf|zip|mp4|css|js|xml)$/i.test(ext))return;
      if(!found.has(u.href)&&found.size<40)found.set(u.href,{url:u.href,label:(label||u.pathname.replace(/\//g,' ').trim()||'Home').trim().slice(0,70)});
     }catch{}
    };
    add(home.href,'Home');
    const response=await fetch(home.href,{redirect:'manual',headers:{accept:'text/html'}});
    if(response.ok&&(response.headers.get('content-type')||'').includes('text/html')){
     const html=(await response.text()).slice(0,500000);
     for(const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
      add(match[1],match[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
     }
    }
    const sitemap=await fetch(new URL('/sitemap.xml',home),{redirect:'manual'});
    if(sitemap.ok&&(sitemap.headers.get('content-type')||'').match(/xml|text/)){
     const xml=(await sitemap.text()).slice(0,500000);
     for(const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi))add(match[1].replace(/&amp;/g,'&'),'');
    }
    const mainRoutes=['/','/about','/about-us','/services','/contact','/contact-us'];const clean=p=>p.toLowerCase().replace(/\/$/,'')||'/';const selected=[...found.values()].filter(p=>mainRoutes.includes(clean(new URL(p.url).pathname)));selected.sort((a,b)=>mainRoutes.indexOf(clean(new URL(a.url).pathname))-mainRoutes.indexOf(clean(new URL(b.url).pathname)));return json({pages:selected.slice(0,2)});
   }catch(e){return json({error:e.message||'Discovery failed'},400);}
  }
  if(path==='/api/screenshot'&&request.method==='POST'){
   try{
    if(!env.BROWSER?.quickAction)return json({error:'Browser Rendering binding is unavailable. Check Cloudflare Worker configuration.',code:'BROWSER_NOT_CONFIGURED'},503);
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
    if(!result.ok){console.error('Browser screenshot failed',{status:result.status,width:preset.width,host:new URL(url).hostname});return json({error:result.status===429?'Browser Rendering rate limit reached. Pause captures and retry later.':'Screenshot rendering failed (browser status '+(result.status??'unknown')+').',code:result.status===429?'BROWSER_RATE_LIMITED':'BROWSER_CAPTURE_FAILED',retryable:result.status===429,retryAfterSeconds:result.status===429?120:undefined},result.status===429?429:502,result.status===429?{'retry-after':'120'}:{});}
    return new Response(result.body,{headers:{'content-type':body.format==='jpg'?'image/jpeg':'image/png','content-disposition':'attachment; filename="export-micirql-'+preset.width+'px.'+body.format+'"','cache-control':'no-store'}});
   }catch(e){console.error('Screenshot request error',{message:e?.message});return json({error:e.message||'Screenshot request failed',code:'CAPTURE_ERROR'},/Invalid URL|Only public|Use a public|Unsupported/.test(e.message||'')?400:502);}
  }
  if(path.startsWith('/api/'))return json({error:'Not found'},404);
  return env.ASSETS.fetch(request);
 }
export default {fetch:exportHandler};
