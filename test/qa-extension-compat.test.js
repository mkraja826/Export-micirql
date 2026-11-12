import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateQaExtensionHandshake,meetsQaLayoutVersion,MIN_QA_LAYOUT_EXTENSION_VERSION}
 from '../public/tools/qa/extension-compat.js';

const handshake=(version='0.3.18',capabilities=['discover','seo-http-evidence','qa-layout'],protocol=3)=>({
 protocol,extensionVersion:version,capabilities
});

test('QA extension requires real inspector protocol, not merely a ping',()=>{
 for(const payload of [null,{},handshake('0.3.17',[],3),
  handshake('0.3.17',['discover','qa-layout'],3),handshake('0.3.17',undefined,2)]){
  const evaluation=evaluateQaExtensionHandshake(payload);
  assert.equal(evaluation.supported,false);
  assert.equal(evaluation.layoutSupported,false);
  assert.equal(evaluation.status,'unsupported');
  assert.match(evaluation.message,/Update/);
 }
});
test('QA extension versions are compared numerically and accept safe newer builds',()=>{
 assert.equal(MIN_QA_LAYOUT_EXTENSION_VERSION,'0.3.17');
 for(const v of ['0.3.17','0.3.18','0.4.0','1.0.0','0.10.2'])
  assert.equal(meetsQaLayoutVersion(v),true,'Expected supported '+v);
 for(const v of ['0.3.16','0.2.99','0.3.9','unknown',null,'','0.3.17-beta','1.0.0.1'])
  assert.equal(meetsQaLayoutVersion(v),false,'Expected no verified layout '+v);
});
test('QA old extension is HTML-only and cannot claim tested viewport evidence',()=>{
 const old=evaluateQaExtensionHandshake(handshake('0.3.16'));
 assert.equal(old.supported,true);
 assert.equal(old.layoutSupported,false);
 assert.equal(old.status,'limited');
 assert.match(old.message,/HTML-only/);
 assert.match(old.message,/v0\.3\.17/);
 const unknown=evaluateQaExtensionHandshake(handshake('unknown'));
 assert.equal(unknown.layoutSupported,false);
 const missing=evaluateQaExtensionHandshake(handshake('0.3.17',['discover','seo-http-evidence']));
 assert.equal(missing.supported,true);
 assert.equal(missing.layoutSupported,false);
});
test('QA current extension may perform three-viewport inspection when capabilities agree',()=>{
 const result=evaluateQaExtensionHandshake(handshake());
 assert.equal(result.supported,true);
 assert.equal(result.layoutSupported,true);
 assert.equal(result.status,'ready');
 assert.match(result.message,/v0\.3\.18/);
 const currentManifest=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 assert.equal(currentManifest.version,'0.3.20');
});
test('QA frontend treats invalid protocol as incompatible, without marking it connected',()=>{
 const src=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 const markup=readFileSync(new URL('../public/tools/qa/index.html',import.meta.url),'utf8');
 assert.match(src,/connected=compatibility\.supported/);
 assert.match(src,/layoutSupported=compatibility\.layoutSupported/);
 assert.match(src,/if\(!extensionResponded\)/);
 assert.match(src,/setup\.hidden=compatibility\.status==='ready'/);
 assert.match(markup,/extension v0\.3\.17 or newer/);
});
