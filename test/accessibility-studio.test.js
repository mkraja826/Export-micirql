import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseAccessibilityPages,inspectAccessibilityCapture,summarizeAccessibilityReport,
 ACCESSIBILITY_PAGE_LIMIT,ACCESSIBILITY_LAYOUT_SAMPLES} from '../public/tools/accessibility/analyzer.js';
const site='https://a11y.example/';
const good='<html lang="en"><head><title>Sample site</title></head><body><h1>Welcome</h1><label for="search">Search</label><input id="search"><img alt="" src="/decorative.png"><a href="/about">About</a><button>OK</button></body></html>';
const analyze=(url=site,html=good,opts={})=>inspectAccessibilityCapture({url,html,...opts});
test('page selection includes site entry, filters foreign origin and caps at 60',()=>{
 const urls=Array.from({length:78},(_,i)=>site+'p'+i);
 const chosen=chooseAccessibilityPages([site+'#fragment','https://other.example/',...urls],site);
 assert.equal(chosen.length,60);
 assert.equal(chosen[0],site);
 assert.ok(chosen.every(u=>new URL(u).origin===new URL(site).origin));
 assert.equal(ACCESSIBILITY_PAGE_LIMIT,60);
 assert.equal(ACCESSIBILITY_LAYOUT_SAMPLES,3);
 assert.throws(()=>chooseAccessibilityPages([],site,61),/1–60/);
});
test('well-described markup has no source review signals, without assigning an accessibility score',()=>{
 const r=analyze();
 assert.equal(r.status,'complete');
 assert.equal(r.signalCount,0);
 assert.equal(r.groups.length,0);
 assert.equal(r.language,'en');
 const aggregate=summarizeAccessibilityReport({website:site,pages:[r]});
 assert.equal(aggregate.summary.sourceReviewSignals,0);
 assert.ok(!('accessibilityScore' in aggregate));
 assert.match(aggregate.manualReviewRequired.join(' '),/cannot certify WCAG/);
});
test('reuses QA missing names and image alternatives, while recording language and title',()=>{
 const r=analyze(site,'<html><head></head><body><h1>Hi</h1><img src="/x.png"><button><svg></svg></button><input><a href="/contact"><svg></svg></a></body></html>');
 const codes=r.groups.map(x=>x.code);
 for(const code of ['missing_document_language','missing_document_title','missing_image_alt',
  'empty_button','unlabelled_control','unnamed_link'])assert.ok(codes.includes(code),code);
 assert.ok(r.groups.every(x=>x.classification==='source_review_candidate'));
});
test('duplicate ID findings are grouped with counts and bounded evidence samples',()=>{
 const html='<html lang="en"><head><title>Test</title></head><body><h1>Header</h1>'+
 '<input id="same" aria-label="A"><input id="same" aria-label="B"><div id="same">X</div></body></html>';
 const r=analyze(site,html),group=r.groups.find(x=>x.code==='duplicate_id');
 assert.equal(group.count,1);
 assert.deepEqual(group.evidenceSamples,['same']);
});
test('partial HTML, unavailable HTML and confirmed server error never get fabricated clean findings',()=>{
 const partial=analyze(site,good,{partial:true});
 const missing=analyze(site,undefined);
 const http=analyze(site,good,{httpStatus:503});
 for(const item of [partial,missing,http]){assert.equal(item.status,'unverified');assert.equal(item.signalCount,0)}
 assert.equal(http.reason,'observed_http_503');
 const aggregate=summarizeAccessibilityReport({website:site,pages:[partial,missing&&{...missing,url:site+'missing'},http&&{...http,url:site+'server'}]});
 assert.equal(aggregate.coverage.completePages,0);
 assert.equal(aggregate.coverage.unverifiedPages,3);
});
test('partial capture cannot leak missed headings into a false negative',()=>{
 const missingH1='<html><head><title>hi</title></head><body><h4>Heading</h4></body></html>';
 const complete=analyze(site,missingH1);
 const partial=analyze(site,missingH1,{partial:true});
 assert.ok(complete.groups.some(g=>g.code==='missing_h1'));
 assert.equal(partial.status,'unverified');
 assert.equal(partial.groups.length,0);
});
test('browser signals are counted only for verified viewport observations and remain review candidates',()=>{
 const p=analyze();
 const report=summarizeAccessibilityReport({website:site,pages:[p],layoutSamples:[{url:site,observations:[
  {width:375,verified:true,buttonsWithoutNames:2,smallNavigationTargets:3,requiredFieldsWithoutLabels:1},
  {width:768,verified:false,buttonsWithoutNames:100},
  {width:1440,verified:true,navigationWithoutTabFocus:2}]}]});
 assert.equal(report.coverage.verifiedLayoutWidthChecks,2);
 assert.equal(report.coverage.expectedLayoutWidthChecks,3);
 assert.equal(report.summary.browserReviewSignals,8);
 assert.equal(report.browserSignals.length,4);
 assert.ok(report.browserSignals.every(x=>x.classification==='browser_review_candidate'));
 assert.deepEqual(report.browserSamples[0].unverifiedWidths,[768]);
});
test('rejects cross-site and duplicate pages, browser evidence for unscanned URLs and excessive samples',()=>{
 const p=analyze();
 assert.throws(()=>summarizeAccessibilityReport({website:site,pages:[p,p]}),/duplicate/);
 assert.throws(()=>summarizeAccessibilityReport({website:site,pages:[{...p,url:'https://other.example/'}]}),/Invalid/);
 assert.throws(()=>summarizeAccessibilityReport({website:site,pages:[p],layoutSamples:[{url:site+'other',observations:[]}]}),/Invalid/);
 assert.throws(()=>summarizeAccessibilityReport({website:site,pages:[p],layoutSamples:Array.from({length:4},()=>({url:site,observations:[]}))}),/Too many/);
});
test('accessible studio uses existing Chrome bridge and printable report, not invented WCAG certification',()=>{
 const app=readFileSync(new URL('../public/tools/accessibility/app.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/tools/accessibility/index.html',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../extension/bridge.js',import.meta.url),'utf8');
 assert.match(app,/MICIRQL_SEO_READ/);
 assert.match(app,/MICIRQL_QA_LAYOUT/);
 assert.match(app,/MICIRQL_DISCOVER/);
 assert.match(app,/selectQaLayoutSamples/);
 assert.match(app,/window\.print\(\)/);
 assert.match(page,/Print \/ Save PDF report/);
 assert.match(page,/contrast/);
 assert.match(bridge,/READ_QA_LAYOUT/);
 assert.doesNotMatch(app,/\/api\/screenshot|\/api\/qa\/html/);
});
