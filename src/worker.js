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
const MCP_TOOLS=[
 {name:'discover_pages',description:'Discover internal website pages from homepage links and sitemap.',inputSchema:{type:'object',properties:{url:{type:'string',description:'Public website URL'}},required:['url'],additionalProperties:false}},
 {name:'capture_screenshot',description:'Capture one full-page website screenshot. Returns an image for visual inspection; use the website for bulk exports.',inputSchema:{type:'object',properties:{url:{type:'string'},width:{type:'integer',enum:[320,375,430,768,1024,1440,1920,3840]},format:{type:'string',enum:['jpg','png'],default:'jpg'}},required:['url','width'],additionalProperties:false}},
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
  const origin=new URL(request.url).origin;
  if(name==='discover_pages'){
   const out=await exportHandler(new Request(origin+'/api/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:publicUrl(args.url)})}),env);
   if(!out.ok)throw Error((await out.json()).error||'Discovery failed');
   return rpc(id,{content:[{type:'text',text:JSON.stringify(await out.json())}]});
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
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/mcp')return mcp(request,env);
  if(path==='/api/health')return json({ok:true,service:'MiCirql Export',presets:PRESETS.length,browserConfigured:!!env.BROWSER});
  if(path==='/api/presets')return json(PRESETS);
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
    return json({pages:[...found.values()]});
   }catch(e){return json({error:e.message||'Discovery failed'},400);}
  }
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
export default {fetch:exportHandler};
