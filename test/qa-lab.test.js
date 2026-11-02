import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectQaHtml,QA_INSPECTOR_VERSION} from '../src/qa-inspector.js';
import {inspectQaHtml as browserInspect,QA_INSPECTOR_VERSION as browserVersion} from '../public/tools/qa/inspector.js';

const url='https://example.com/services';
const base='<html lang="en"><head><title>Services</title></head><body><main><h1>Services</h1><a href="#team">Team</a><div id="team">People</div><form><label for="email">Email</label><input id="email"><button>Send</button></form><img src="/team.png" alt="Team portrait"></main></body></html>';

test('QA browser and server inspectors return identical results and versions',()=>{
 assert.equal(QA_INSPECTOR_VERSION,'micirql-qa-v1');
 assert.equal(QA_INSPECTOR_VERSION,browserVersion);
 assert.deepEqual(inspectQaHtml(base,url),browserInspect(base,url));
 assert.deepEqual(inspectQaHtml(base,url).findings,[]);
});
test('QA detects actual unlabeled fields, unnamed buttons and links, missing alt',()=>{
 const html='<html><body><h1>Example</h1><input type="email"><button><span></span></button><a href="/contact"><svg></svg></a><img src="/work.jpg"></body></html>';
 const report=inspectQaHtml(html,url);
 for(const code of ['unlabelled_control','empty_button','unnamed_link','missing_image_alt'])assert.ok(report.findings.some(f=>f.code===code),code);
 assert.equal(report.auditStatus,'complete');
});
test('QA recognizes wrapped labels, explicitly named buttons and links',()=>{
 const html='<html><body><h1>Forms</h1><label>First name <input></label><input aria-label="Surname"><button aria-label="Open menu"><svg></svg></button><a href="/home" aria-label="Home"><svg></svg></a></body></html>';
 const report=inspectQaHtml(html,url);
 assert.ok(!report.findings.some(f=>['unlabelled_control','empty_button','unnamed_link'].includes(f.code)));
});
test('QA ignores source code comments, templates and script embedded tags',()=>{
 const fake='<!-- <h4>Fake</h4><img src="/fake.jpg"> -->'
  +'<script>const example="<input><h4>Fake</h4><img src=/bad.jpg>";</script>'
  +'<template><h4>Fake</h4><img src="/fake.jpg"></template>'
  +'<style>/* <button></button><img src=/fake.jpg> */</style>';
 const result=inspectQaHtml(base.replace('</body>',fake+'</body>'),url);
 assert.deepEqual(result.findings,[]);
 assert.deepEqual(result.counts,{headings:1,images:1,links:1,formControls:1,buttons:1});
});
test('QA does not treat textarea sample contents as page links or headings',()=>{
 const html='<html><body><h1>Editor</h1><label for="code">HTML</label><textarea id="code"><h4>Fake</h4><img src="/fake.jpg"><a href="#missing">Bad</a></textarea></body></html>';
 const result=inspectQaHtml(html,url);
 assert.equal(result.counts.headings,1);
 assert.equal(result.counts.images,0);
 assert.equal(result.counts.links,0);
 assert.equal(result.counts.formControls,1);
 assert.deepEqual(result.findings,[]);
});
test('QA treats explicitly decorative and tracking images as non-problematic',()=>{
 const html='<html><body><h1>Design</h1><img role="presentation" src="/visual.svg"><img role="none" src="/separator.svg"><img aria-hidden="true" src="/ornament.svg"><img src="/beacon.gif" width="1" height="1"><img src="/decoration.jpg" alt=""></body></html>';
 const result=inspectQaHtml(html,url);
 assert.equal(result.counts.images,5);
 assert.ok(!result.findings.some(f=>f.code==='missing_image_alt'));
});
test('QA does not claim absent H1 and anchors on incomplete captured pages',()=>{
 const html='<body><h3>Loading content</h3><a href="#not-yet-loaded">Jump</a></body>';
 const complete=inspectQaHtml(html,url);
 const partial=inspectQaHtml(html,url,{partial:true});
 assert.ok(complete.findings.some(f=>f.code==='missing_h1'));
 assert.ok(complete.findings.some(f=>f.code==='missing_anchor'));
 assert.ok(!partial.findings.some(f=>['missing_h1','missing_anchor'].includes(f.code)));
 assert.equal(partial.auditStatus,'partial');
});
test('QA rejects oversized source and unsupported or credentialed URLs',()=>{
 assert.throws(()=>inspectQaHtml('x'.repeat(1000001),url),/1 MB/);
 assert.throws(()=>inspectQaHtml(base,'file:///etc/passwd'),/Invalid website URL/);
 assert.throws(()=>inspectQaHtml(base,'https://user:secret@example.com'),/Invalid website URL/);
});
test('QA tool presents extension-first single URL, accurate scope, and printable PDF',()=>{
 const page=readFileSync(new URL('../public/tools/qa/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 for(const id of ['audit','url','run','extension-status','setup','progress','results','print','advanced','manual','download'])assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/Save report as PDF/);
 assert.match(page,/Choose .*Save as PDF/);
 assert.match(page,/captured static HTML/);
 assert.match(app,/MICIRQL_DISCOVER/);
 assert.match(app,/MICIRQL_SEO_READ/);
 assert.match(app,/pages.length===60/);
 assert.match(app,/origin===url.origin/);
 assert.match(app,/partialPages/);
 assert.match(app,/window.print\(\)/);
 assert.ok(!app.includes("fetch('/api/qa/html'"),'No server-side HTML upload for the normal browser-first scan');
});

test('QA flags duplicate element IDs once and preserves browser parity',()=>{
 const html='<html><body><h1>Contact</h1><div id="same">A</div><div id="same">B</div><a href="#same">Go</a></body></html>';
 const server=inspectQaHtml(html,url),browser=browserInspect(html,url);
 assert.deepEqual(server,browser);
 assert.equal(server.findings.filter(item=>item.code==='duplicate_id').length,1);
 assert.equal(server.findings.find(item=>item.code==='duplicate_id').evidence,'same');
});
test('QA new-tab advice does not falsely claim a security vulnerability',()=>{
 const html='<html><body><h1>Links</h1><a href="https://example.org" target="_blank">External</a></body></html>';
 const report=inspectQaHtml(html,url);
 assert.equal(report.findings.find(item=>item.code==='new_tab_without_noopener')?.severity,'info');
 assert.match(report.findings.find(item=>item.code==='new_tab_without_noopener')?.message||'',/Modern browsers/);
});


test('QA Lab samples up to three complete pages and declares read-only scope',()=>{
 const app=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/tools/qa/index.html',import.meta.url),'utf8');
 assert.match(app,/layoutSupported=Array\.isArray\(event\.data\.capabilities\)/);
 assert.match(app,/MICIRQL_QA_LAYOUT/);
 assert.match(app,/MICIRQL_QA_LAYOUT_RESULT/);
 assert.match(app,/layoutInspection/);
 assert.match(app,/Observing layout /);
 assert.match(app,/layoutSamplingLimit:3/);
 assert.match(app,/for\(const page of completeReports\)choose\(page\)/);
 assert.match(app,/page\.counts\?\.formControls>0/);
 assert.match(app,/does not establish complete-site responsive or functional correctness/);
 assert.match(page,/Browser-rendered layout and accessible-control observations sample up to three/);
 assert.match(page,/A sample does not verify every page/);
 assert.match(page,/id="layout-summary"/);
 assert.match(page,/id="layout-details"/);
 assert.doesNotMatch(app,/\.click\(\)\s*;\s*\/\/.*form submission/);
});


test('read-only QA observations report bounded navigation and form counts, with old-extension fallback',()=>{
 const app=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.version,'0.3.17');
 for(const field of ['placeholderNavigationLinks','scriptedNavigationLinks','missingNavigationFragmentTargets','implicitSubmitButtons']){
  assert.ok(source.includes(field),'Extension must provide '+field);
  assert.ok(app.includes(field),'Report must show '+field);
 }
 assert.match(app,/Number\.isFinite\(item\.placeholderNavigationLinks\)/);
 assert.match(app,/Update the extension for these read-only observations/);
 assert.match(source,/do not click, follow links, edit fields, validate or submit forms/);
 assert.match(source,/Return aggregate counts only/);
 assert.doesNotMatch(source.slice(source.indexOf('async function readQaLayout('),source.indexOf('async function checkSeoLinkStatus(')),/\.submit\(|\.click\(|\.dispatchEvent\(|\.value\s*=/);
});


test('QA Lab reports read-only keyboard, named-button and touch-target observations without false WCAG verdicts',()=>{
 const app=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 const background=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
 const fields=['visibleButtons','buttonsWithoutNames','customInteractiveControls','customControlsWithoutTabFocus','navigationWithoutTabFocus','smallNavigationTargets','requiredFieldsWithoutLabels'];
 for(const field of fields)assert.ok(background.includes(field),'Chrome observation is missing '+field);
 for(const field of ['buttonsWithoutNames','customControlsWithoutTabFocus','navigationWithoutTabFocus','smallNavigationTargets','requiredFieldsWithoutLabels'])assert.ok(app.includes(field),'Printable report is missing '+field);
 assert.match(app,/Number\.isFinite\(item\.buttonsWithoutNames\)/,'Old extensions must not show invented zero counts');
 assert.match(app,/not confirmed accessibility failures/);
 assert.match(app,/Spacing, inline-text and other exceptions were not evaluated/);
 assert.match(background,/Return aggregate counts only/);
 assert.match(background,/getBoundingClientRect/);
 const observer=background.slice(background.indexOf('async function readQaLayout('),background.indexOf('async function checkSeoLinkStatus('));
 assert.doesNotMatch(observer,/\.submit\(|\.click\(|\.dispatchEvent\(|\.value\s*=|\.focus\(/);
});
