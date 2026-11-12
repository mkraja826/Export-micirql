import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseResponsiveSamples,buildResponsiveReport,RESPONSIVE_PAGE_SAMPLE_LIMIT,
 RESPONSIVE_VIEWPORTS} from '../public/tools/responsive/analyzer.js';
const origin='https://responsive.example/';
const measure=(width,extra={})=>({width,verified:true,observedWidth:width,
 documentWidth:width,horizontalOverflowPx:0,...extra});
const sample=(slug,observations,error=null)=>({requestedUrl:origin+slug,observations,error});
test('sampling includes entry page then contact or service page, bounded to 3',()=>{
 const found=chooseResponsiveSamples([origin+'blog',origin+'contact',origin+'services',origin+'blog'],origin,3);
 assert.deepEqual(found.selectedPages,[origin,origin+'contact',origin+'blog']);
 assert.equal(found.discoveredValidPages,4);
 assert.equal(found.selectionLimited,true);
 assert.equal(RESPONSIVE_PAGE_SAMPLE_LIMIT,3);
 assert.deepEqual(RESPONSIVE_VIEWPORTS,[375,768,1440]);
});
test('discovery filters cross-origin and invalid schemes without inventing pages',()=>{
 const found=chooseResponsiveSamples(['https://untrusted.example/login','javascript:alert(1)',
  origin+'a#one',origin+'a#two',origin+'contact'],origin,3);
 assert.deepEqual(found.selectedPages,[origin,origin+'contact',origin+'a']);
 assert.equal(found.discoveredValidPages,3);
 assert.throws(()=>chooseResponsiveSamples([],origin,60),/1–3/);
});
test('measured CSS document overflow and mobile scaling are review signals, not design scores',()=>{
 const r=buildResponsiveReport({website:origin,discoveredPages:45,samples:[
  sample('',[measure(375,{documentWidth:426,horizontalOverflowPx:51,scaledMobileLayout:true,
    missingMobileViewportMeta:true}),measure(768),measure(1440)])
 ]});
 assert.equal(r.coverage.verifiedViewportChecks,3);
 assert.equal(r.coverage.discoveredPages,45);
 assert.equal(r.summary.measuredOverflowSignals,1);
 assert.equal(r.summary.scaledMobileSignals,1);
 assert.equal(r.summary.missingMobileViewportSignals,1);
 assert.equal(r.summary.reviewSignals,3);
 assert.ok(!('score' in r));
 assert.equal(r.coverage.selectionLimited,true);
});
test('failed and absent viewport measurements remain unverified, never a pass',()=>{
 const r=buildResponsiveReport({website:origin,samples:[
  sample('',[measure(375,{verified:false,reason:'Chrome debugger busy'}),measure(768)])
 ]});
 assert.deepEqual({total:r.coverage.expectedViewportChecks,verified:r.coverage.verifiedViewportChecks,
  unverified:r.coverage.unverifiedViewportChecks},{total:3,verified:1,unverified:2});
 assert.equal(r.pages[0].viewports[0].reason,'Chrome debugger busy');
 assert.equal(r.pages[0].viewports[2].verification,'unverified');
 assert.equal(r.summary.reviewSignals,0);
});
test('zero-overflow measurements do not claim clipped layouts are verified clean',()=>{
 const r=buildResponsiveReport({website:origin,samples:[sample('about',RESPONSIVE_VIEWPORTS.map(w=>measure(w)))]});
 assert.equal(r.coverage.verifiedViewportChecks,3);
 assert.equal(r.summary.reviewSignals,0);
 assert.match(r.limitations.join(' '),/not proof of visual usability/);
});
test('rejects duplicated, foreign, or more than three page samples',()=>{
 const one=sample('',[]);
 assert.throws(()=>buildResponsiveReport({website:origin,samples:[one,one]}),/duplicate/);
 assert.throws(()=>buildResponsiveReport({website:origin,samples:[
  sample('',[]),sample('a',[]),sample('b',[]),sample('c',[])]}),/Too many/);
 assert.throws(()=>buildResponsiveReport({website:origin,samples:[
  {requestedUrl:'https://outside.example/',observations:[]}]}),/Invalid or duplicate/);
});
test('report does not modify original Chrome observations',()=>{
 const observations=[measure(375,{documentWidth:380,horizontalOverflowPx:5}),measure(768)];
 const old=JSON.stringify(observations);
 buildResponsiveReport({website:origin,samples:[sample('',observations)]});
 assert.equal(JSON.stringify(observations),old);
});
test('responsive beta uses the existing QA layout bridge, with no new capture engine',()=>{
 const client=readFileSync(new URL('../public/tools/responsive/app.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/tools/responsive/index.html',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
 assert.match(client,/MICIRQL_QA_LAYOUT/);
 assert.match(client,/MICIRQL_DISCOVER/);
 assert.match(client,/evaluateQaExtensionHandshake/);
 assert.match(client,/window\.print\(\)/);
 assert.match(ui,/375px, 768px and 1440px/);
 assert.match(bridge,/READ_QA_LAYOUT/);
 assert.doesNotMatch(client,/\/api\/screenshot|\/api\/discover|MICIRQL_CAPTURE/);
});
