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
 const request=new Request(base+'/api/seo/html',{method:'POST',body:JSON.stringify({url:'https://example.com/',html:'x'.repeat(1100000)})});
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
