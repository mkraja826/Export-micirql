import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker from '../src/worker.js';
const env={MCP_API_TOKEN:'test-secret',BROWSER:{},ASSETS:{fetch:async()=>new Response('assets')}};
const req=(body,token='test-secret')=>new Request('https://export.micirql.com/mcp',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
const rpc=(method,params={})=>({jsonrpc:'2.0',id:1,method,params});
test('MCP requires configured token',async()=>{assert.equal((await worker.fetch(req(rpc('ping')),{...env,MCP_API_TOKEN:undefined})).status,503)});
test('MCP rejects incorrect token',async()=>{assert.equal((await worker.fetch(req(rpc('ping'),'wrong'),env)).status,401)});
test('MCP initializes',async()=>{const r=await worker.fetch(req(rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}})),env);assert.equal(r.status,200);const j=await r.json();assert.equal(j.result.serverInfo.name,'micirql-export')});
test('MCP lists five tools',async()=>{const j=await(await worker.fetch(req(rpc('tools/list')),env)).json();assert.deepEqual(j.result.tools.map(x=>x.name),['discover_pages','capture_screenshot','capture_responsive','plan_website_capture','list_viewports'])});
test('MCP returns viewport presets',async()=>{const j=await(await worker.fetch(req(rpc('tools/call',{name:'list_viewports',arguments:{}})),env)).json();assert.equal(JSON.parse(j.result.content[0].text).length,8)});
test('MCP returns structured error for unknown tool',async()=>{const j=await(await worker.fetch(req(rpc('tools/call',{name:'missing',arguments:{}})),env)).json();assert.equal(j.error.code,-32602)});
test('Worker health route responds',async()=>{const j=await(await worker.fetch(new Request('https://export.micirql.com/api/health'),env)).json();assert.equal(j.ok,true)});

test('MCP screenshot returns image data for valid width',async()=>{
 const fake=new Uint8Array([255,216,255,217]);
 const mocked={...env,BROWSER:{quickAction:async()=>({ok:true,body:fake})}};
 const j=await(await worker.fetch(req(rpc('tools/call',{name:'capture_screenshot',arguments:{url:'https://example.com/',width:375,format:'jpg'}})),mocked)).json();
 assert.equal(j.result.content[0].type,'image');
 assert.equal(j.result.content[0].mimeType,'image/jpeg');
 assert.equal(j.result.content[0].data,Buffer.from(fake).toString('base64'));
});
test('MCP rejects unsupported screenshot widths',async()=>{
 const j=await(await worker.fetch(req(rpc('tools/call',{name:'capture_screenshot',arguments:{url:'https://example.com/',width:123,format:'jpg'}})),env)).json();
 assert.equal(j.result.isError,true);
});
test('MCP rejects private localhost URLs',async()=>{
 const j=await(await worker.fetch(req(rpc('tools/call',{name:'capture_screenshot',arguments:{url:'http://localhost/',width:375}})),env)).json();
 assert.equal(j.result.isError,true);
});
test('MCP accepts initialized notification',async()=>{
 const r=await worker.fetch(req({jsonrpc:'2.0',method:'notifications/initialized'}),env);
 assert.equal(r.status,202);
});

test('Responsive capture returns one image per requested viewport',async()=>{
 let calls=0;
 const mocked={...env,BROWSER:{quickAction:async()=>{calls++;return {ok:true,body:new Uint8Array([255,216,255,217])}}}};
 const j=await(await worker.fetch(req(rpc('tools/call',{name:'capture_responsive',arguments:{url:'https://example.com',widths:[320,768,1440],format:'jpg'}})),mocked)).json();
 assert.equal(j.result.content.filter(x=>x.type==='image').length,3);
 assert.equal(calls,3);
});
test('Responsive capture rejects oversized batches',async()=>{
 const j=await(await worker.fetch(req(rpc('tools/call',{name:'capture_responsive',arguments:{url:'https://example.com',widths:[320,375,430,768,1024]}})),env)).json();
 assert.equal(j.result.isError,true);
});

test('Full-site plan returns discovered page-width matrix without capturing',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>new Response('<html><a href="/about">About</a><a href="/contact">Contact</a></html>',{headers:{'content-type':'text/html'}});
 try{
  const j=await(await worker.fetch(req(rpc('tools/call',{name:'plan_website_capture',arguments:{url:'https://example.com',widths:[375,1440],maxPages:3}})),env)).json();
  const plan=JSON.parse(j.result.content[0].text);
  assert.equal(plan.jobCreated,false);
  assert.equal(plan.totalCaptures,6);
  assert.equal(plan.captures.length,6);
 }finally{globalThis.fetch=oldFetch}
});

test('Screenshot API propagates Cloudflare rate limiting',async()=>{
 const mocked={...env,BROWSER:{quickAction:async()=>({ok:false,status:429})}};
 const response=await worker.fetch(new Request('https://export.micirql.com/api/screenshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com',width:375,format:'jpg'})}),mocked);
 assert.equal(response.status,429);
 const body=await response.json();
 assert.equal(body.code,'BROWSER_RATE_LIMITED');
});
