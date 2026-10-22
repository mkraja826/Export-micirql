import test from 'node:test';
import assert from 'node:assert/strict';
import {exportHandler} from '../src/worker.js';

const base='https://tools.micirql.com';
const env={};

test('SEO endpoint returns structured static HTML findings',async()=>{
 const html='<html lang="en"><head><title>MiCirql QA</title><meta name="description" content="Example"><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/"></head><body><h1>Welcome</h1></body></html>';
 const request=new Request(base+'/api/seo/html',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com/',html})});
 const response=await exportHandler(request,env);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.title,'MiCirql QA');
 assert.equal(data.h1Count,1);
 assert.ok(Array.isArray(data.findings));
 assert.equal(data.scope,'static_html_only');
});

test('SEO endpoint rejects oversized request body',async()=>{
 const request=new Request(base+'/api/seo/html',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com/',html:'x'.repeat(1100000)})});
 const response=await exportHandler(request,env);
 assert.equal(response.status,413);
});

test('SEO endpoint requires JSON content type',async()=>{
 const response=await exportHandler(new Request(base+'/api/seo/html',{method:'POST',headers:{'content-type':'text/plain'},body:'hello'}),env);
 assert.equal(response.status,415);
});

test('MCP refuses access without token configuration',async()=>{
 const request=new Request(base+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 const response=await exportHandler(request,env);
 assert.equal(response.status,503);
});

test('tool catalog advertises limited SEO availability',async()=>{
 const response=await exportHandler(new Request(base+'/api/tools'),env);
 assert.equal(response.status,200);
 const catalog=await response.json();
 assert.equal(catalog.tools.find(tool=>tool.id==='seo').status,'limited');
});


test('tools domain serves dashboard and screenshot studio; export redirects',async()=>{
 const paths=[];
 const mocked={ASSETS:{fetch:async request=>{paths.push(new URL(request.url).pathname);return new Response('ok')}}};
 const dashboard=await exportHandler(new Request('https://tools.micirql.com/'),mocked);
 const studio=await exportHandler(new Request('https://tools.micirql.com/tools/screenshots/'),mocked);
 const legacy=await exportHandler(new Request('https://export.micirql.com/?url=https%3A%2F%2Fexample.com'),mocked);
 const legacyGuide=await exportHandler(new Request('https://export.micirql.com/full-page-screenshot/'),mocked);
 assert.equal(dashboard.status,200);
 assert.equal(studio.status,200);
 assert.deepEqual(paths,['/tools/index.html','/index.html']);
 assert.equal(legacy.status,308);
 assert.equal(legacy.headers.get('location'),'https://tools.micirql.com/tools/screenshots/?url=https%3A%2F%2Fexample.com');
 assert.equal(legacyGuide.status,308);
 assert.equal(legacyGuide.headers.get('location'),'https://tools.micirql.com/full-page-screenshot/');
});

test('legacy export APIs remain compatible',async()=>{
 const response=await exportHandler(new Request('https://export.micirql.com/api/presets'),{});
 assert.equal(response.status,200);
 assert.equal((await response.json()).length,3);
});

test('QA endpoint returns bounded static findings',async()=>{
 const response=await exportHandler(new Request(base+'/api/qa/html',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com/',html:'<h1>Hi</h1><img src="x">'})}),env);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.scope,'static_html_only');
 assert.ok(data.findings.some(item=>item.code==='missing_image_alt'));
});
test('QA endpoint rejects non-JSON bodies',async()=>{
 const response=await exportHandler(new Request(base+'/api/qa/html',{method:'POST',headers:{'content-type':'text/plain'},body:'hello'}),env);
 assert.equal(response.status,415);
});
test('QA endpoint rejects local URLs',async()=>{
 const response=await exportHandler(new Request(base+'/api/qa/html',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'http://localhost/',html:'<h1>Hi</h1>'})}),env);
 assert.equal(response.status,400);
});


test('UI endpoint returns source-level findings',async()=>{
 const response=await exportHandler(new Request(base+'/api/ui/html',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://example.com/',html:'<html><body><h1>Hi</h1></body></html>'})}),env);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.scope,'static_html_ui_signals_only');
 assert.ok(data.findings.some(x=>x.code==='missing_viewport'));
});

test('UI endpoint rejects unsupported content type',async()=>{
 const response=await exportHandler(new Request(base+'/api/ui/html',{method:'POST',headers:{'content-type':'text/plain'},body:'invalid'}),env);
 assert.equal(response.status,415);
});
