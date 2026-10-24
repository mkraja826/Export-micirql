import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSeoHtml} from '../src/seo-inspector.js';

test('well formed page has no basic findings',()=>{
 const html='<html lang="en"><head><title>Example Business</title><meta name="description" content="An example business"><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/"></head><body><h1>Welcome</h1></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.equal(report.title,'Example Business');
 assert.equal(report.canonical,'https://example.com/');
 assert.equal(report.auditStatus,'complete');
 assert.ok(Number.isInteger(report.score));
 assert.ok(report.score>=0&&report.score<=100);
});
test('missing metadata yields structured findings',()=>{
 const report=inspectSeoHtml('<html><body><h1>A</h1><h1>B</h1></body></html>','https://example.com/');
 assert.equal(report.h1Count,2);
 assert.ok(report.findings.some(x=>x.code==='missing_title'));
 assert.ok(report.findings.some(x=>x.code==='heading_count'));
});
test('robots noindex is a significant indexability finding',()=>{
 const report=inspectSeoHtml('<html lang="en"><head><title>Test</title><meta name="robots" content="noindex"></head><body></body></html>','https://example.com/');
 assert.ok(report.findings.some(x=>x.code==='noindex'&&x.severity==='high'));
});
test('error pages do not receive misleading SEO scores',()=>{
 const report=inspectSeoHtml('<html><head><title>capdent.in | 522: Connection timed out</title></head><body><h1>Connection timed out</h1></body></html>','https://www.capdent.in/');
 assert.equal(report.auditStatus,'invalid_error_page');
 assert.equal(report.score,null);
 assert.equal(report.findings[0].code,'error_page');
});
test('complete and partial audits report scores honestly',()=>{
 const html='<html lang="en"><head><title>Example Website With Proper Descriptive Title</title><meta name="description" content="A descriptive sample website for SEO scoring and inspection across devices and browsers with useful content for visitors."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/"></head><body><h1>Welcome</h1><img src="/photo.jpg"></body></html>';
 const full=inspectSeoHtml(html,'https://example.com/');
 const partial=inspectSeoHtml(html,'https://example.com/',{partial:true});
 assert.equal(full.auditStatus,'complete');
 assert.equal(partial.auditStatus,'partial');
 assert.equal(full.score,partial.score);
 assert.ok(full.findings.some(x=>x.code==='images_missing_alt'));
 assert.ok(full.score<100);
});
test('valid absolute canonical URL is not flagged invalid',()=>{
 const html='<html lang="en"><head><title>Example Website That Has a Valid Canonical</title><link rel="canonical" href="https://example.com/"><meta name="viewport" content="width=device-width"></head><body><h1>Example</h1></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.equal(report.canonical,'https://example.com/');
 assert.equal(report.findings.some(x=>x.code==='canonical_invalid'),false);
});
test('missing critical SEO elements reduce the score',()=>{
 const weak=inspectSeoHtml('<html><body></body></html>','https://example.com/');
 assert.ok(weak.score<70);
 assert.ok(weak.findings.some(x=>x.code==='missing_title'&&x.points>0));
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

test('multiple canonical declarations are high severity',()=>{
 const html='<html lang="en"><head><title>Example Detailed Website Page Title</title><link rel="canonical" href="https://example.com/a"><link rel="canonical" href="https://example.com/b"></head><body><h1>Example</h1></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/a');
 assert.ok(report.findings.some(f=>f.code==='multiple_canonicals'&&f.severity==='high'));
});
test('Googlebot-specific noindex is surfaced even without generic robots tag',()=>{
 const html='<html lang="en"><head><title>Example Detailed Website Page Title</title><meta name="googlebot" content="noindex,follow"></head><body><h1>Example</h1></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.ok(report.findings.some(f=>f.code==='noindex'&&f.severity==='high'));
});
test('generic and Googlebot noindex result in one finding',()=>{
 const html='<head><meta name="robots" content="noindex"><meta name="googlebot" content="noindex"></head>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.equal(report.findings.filter(f=>f.code==='noindex').length,1);
});

test('scoring explains deductions by category without inventing category scores',()=>{
 const html='<html><head><title>Short</title></head><body><h1>A</h1><h1>B</h1></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.equal(report.scoring.startingScore,100);
 assert.equal(Object.values(report.scoring.categoryDeductions).reduce((a,b)=>a+b,0),report.scoring.totalDeductions);
 assert.equal(report.score,Math.max(0,100-report.scoring.totalDeductions));
 assert.equal(report.scoring.coverage,'provided_html_only');
 assert.equal(inspectSeoHtml(html,'https://example.com/',{partial:true}).scoring.coverage,'partial_html_snapshot');
});

test('partial HTML captures do not turn missing or skipped headings into confirmed defects',()=>{
 const fragment='<html><head><title>Example page title used for inspection</title></head><body><h2>Partial section</h2><h4>Nested section</h4></body></html>';
 const full=inspectSeoHtml(fragment,'https://example.com/');
 const partial=inspectSeoHtml(fragment,'https://example.com/',{partial:true});
 assert.ok(full.findings.some(x=>x.code==='heading_count'));
 assert.ok(full.findings.some(x=>x.code==='heading_hierarchy'));
 assert.ok(!partial.findings.some(x=>x.code==='heading_count'||x.code==='heading_hierarchy'));
 assert.ok(partial.findings.some(x=>x.code==='heading_unverified'&&x.points===0));
 assert.equal(partial.auditStatus,'partial');
});
