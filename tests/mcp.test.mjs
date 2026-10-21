import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker from '../src/worker.js';
const env={MCP_API_TOKEN:'test-secret',BROWSER:{},ASSETS:{fetch:async()=>new Response('assets')}};
const req=(body,token='test-secret')=>new Request('https://export.micirql.com/mcp',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
const rpc=(method,params={})=>({jsonrpc:'2.0',id:1,method,params});
test('MCP requires configured token',async()=>{assert.equal((await worker.fetch(req(rpc('ping')),{...env,MCP_API_TOKEN:undefined})).status,503)});
test('MCP rejects incorrect token',async()=>{assert.equal((await worker.fetch(req(rpc('ping'),'wrong'),env)).status,401)});
test('MCP initializes',async()=>{const r=await worker.fetch(req(rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}})),env);assert.equal(r.status,200);const j=await r.json();assert.equal(j.result.serverInfo.name,'micirql-export')});
test('MCP lists three tools',async()=>{const j=await(await worker.fetch(req(rpc('tools/list')),env)).json();assert.deepEqual(j.result.tools.map(x=>x.name),['discover_pages','capture_screenshot','list_viewports'])});
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
