import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const full=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const begin=full.indexOf('async function readSecurityHeaders(');
const end=full.indexOf('chrome.runtime.onMessage.addListener(',begin);
assert.ok(begin!==-1&&end>begin,'Chrome security observer must be defined before message routing');
const body=full.slice(begin,end);
function setup(fetchImplementation){
 const calls=[];
 const fakeFetch=async(url,options)=>{
  calls.push({url,options});
  return fetchImplementation(url,options);
 };
 const ctx={URL,AbortController,setTimeout,clearTimeout,fetch:fakeFetch};
 const observer=runInNewContext(body+'; readSecurityHeaders;',ctx);
 return {observer,calls};
}
const response=(status=200,headers={})=>({
 type:'basic',url:'https://security.example/',status,
 headers:{get:name=>headers[name]??null},
 body:{cancel:async()=>{}}
});
test('security observer performs one read-only GET without cookies, follows no redirects and cancels body',async()=>{
 let cancelled=0;
 const r=response(200,{'strict-transport-security':'max-age=31536000','set-cookie':'session=secret'});
 r.body.cancel=async()=>{cancelled++};
 const {observer,calls}=setup(async()=>r);
 const result=await observer('https://security.example/');
 assert.equal(result.ok,true);assert.equal(result.observed,true);
 assert.equal(result.headers['strict-transport-security'],'max-age=31536000');
 assert.ok(!('set-cookie' in result.headers));
 assert.equal(cancelled,1);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.credentials,'omit');
 assert.equal(calls[0].options.redirect,'manual');
 assert.equal(calls[0].options.cache,'no-store');
});
test('only configured safe headers are transmitted and values have a byte-length cap',async()=>{
 const extra='x'.repeat(3000);
 const {observer}=setup(async()=>response(200,{'content-security-policy':extra,'authorization':'Bearer hidden','server':'private'}));
 const outcome=await observer('https://security.example/');
 assert.equal(outcome.headers['content-security-policy'].length,2048);
 assert.ok(!('authorization' in outcome.headers));
 assert.ok(!('server' in outcome.headers));
});
test('Chrome opaque redirects are unverified; never become HTTP 200 or a silent pass',async()=>{
 const {observer}=setup(async()=>({type:'opaqueredirect',status:0,url:'',headers:{get:()=>null},
  body:{cancel:async()=>{}}}));
 const outcome=await observer('https://security.example/');
 assert.equal(outcome.observed,false);assert.equal(outcome.status,null);
 assert.equal(outcome.reason,'response_not_exposed');
});
test('visible 301 response remains a redirect with no follow-up request',async()=>{
 const {observer,calls}=setup(async()=>response(301,{location:'/redirected'}));
 const result=await observer('https://security.example/');
 assert.equal(result.status,301);
 assert.equal(result.location,'/redirected');
 assert.equal(calls.length,1);
});
test('network failures stay unverified without manufacturing absent headers',async()=>{
 const {observer}=setup(async()=>{throw Error('Network unavailable')});
 const r=await observer('https://security.example/');
 assert.equal(r.observed,false);assert.equal(r.status,null);
 assert.equal(r.reason,'network_or_cors_unverified');
});
test('unsafe local, credentialed, state-changing or query-bearing URLs are rejected pre-fetch',async()=>{
 const {observer,calls}=setup(async()=>response());
 for(const url of ['http://127.0.0.1/','https://localhost/',
  'https://internal.local/','https://[::1]/','https://u:p@security.example/',
  'https://security.example/logout','https://security.example/api/delete',
  'https://security.example/checkout','https://security.example/?token=123']){
  await assert.rejects(async()=>observer(url));
 }
 assert.equal(calls.length,0);
});
test('extension message router exposes safe security observer through trusted bridge',()=>{
 const bridge=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
 assert.match(full,/if\(message\?\.type==='READ_SECURITY_HEADERS'\)/);
 assert.match(bridge,/if\(type==='MICIRQL_SECURITY_HEADERS'\)/);
 assert.match(bridge,/READ_SECURITY_HEADERS/);
 assert.match(bridge,/security-headers/);
});
