import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSeoHtml} from '../src/seo-inspector.js';

test('well formed page has no basic findings',()=>{
 const html='<html lang="en"><head><title>Example Business</title><meta name="description" content="An example business"><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/"></head><body><h1>Welcome</h1></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.equal(report.title,'Example Business');
 assert.equal(report.canonical,'https://example.com/');
 assert.deepEqual(report.findings,[]);
});
test('missing metadata yields structured findings',()=>{
 const report=inspectSeoHtml('<html><body><h1>A</h1><h1>B</h1></body></html>','https://example.com/');
 assert.equal(report.h1Count,2);
 assert.ok(report.findings.some(x=>x.code==='missing_title'));
 assert.ok(report.findings.some(x=>x.code==='heading_count'));
});
test('robots noindex is reported without treating it as a fatal error',()=>{
 const report=inspectSeoHtml('<html lang="en"><head><title>Test</title><meta name="robots" content="noindex"></head><body></body></html>','https://example.com/');
 assert.ok(report.findings.some(x=>x.code==='noindex'&&x.severity==='info'));
});
test('rejects non-string input',()=>{
 assert.throws(()=>inspectSeoHtml(null,'https://example.com/'));
});

import {inspectQaHtml} from '../src/qa-inspector.js';

test('QA flags missing heading and image alternative',()=>{
 const result=inspectQaHtml('<h2>Intro</h2><img src="photo.png">','https://example.com/');
 assert.ok(result.findings.some(x=>x.code==='missing_h1'));
 assert.ok(result.findings.some(x=>x.code==='missing_image_alt'));
});

test('QA accepts labeled form input',()=>{
 const result=inspectQaHtml('<h1>Home</h1><label for="query">Search</label><input id="query">','https://example.com/');
 assert.equal(result.findings.length,0);
});

import {inspectUiHtml} from '../src/ui-inspector.js';

test('UI inspector detects missing viewport and main landmark',()=>{
 const report=inspectUiHtml('<html><head></head><body><nav>Menu</nav></body></html>','https://example.com/');
 assert.ok(report.findings.some(x=>x.code==='missing_viewport'));
 assert.ok(report.findings.some(x=>x.code==='missing_main'));
});

test('UI inspector reports restricted zoom',()=>{
 const report=inspectUiHtml('<head><meta name="viewport" content="width=device-width,maximum-scale=1"></head><main>Content</main><nav>Menu</nav>','https://example.com/');
 assert.ok(report.findings.some(x=>x.code==='zoom_restricted'));
});
