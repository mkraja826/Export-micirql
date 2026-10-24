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

test('detects duplicate title and meta description tags in complete head',()=>{
 const html='<html lang="en"><head><title>First page title for example</title><title>Second page title for example</title><meta name="description" content="Primary description"><meta name="description" content="Conflicting description"></head><body><h1>Example</h1></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.ok(report.findings.some(f=>f.code==='multiple_titles'&&f.category==='metadata'));
 assert.ok(report.findings.some(f=>f.code==='multiple_descriptions'&&f.category==='metadata'));
});
test('single title and description tags do not cause duplicate warnings',()=>{
 const report=inspectSeoHtml('<head><title>Example page with one title</title><meta name="description" content="One unique description"></head><body><h1>Example</h1></body>','https://example.com/');
 assert.ok(!report.findings.some(f=>f.code==='multiple_titles'||f.code==='multiple_descriptions'));
});

test('reports unnamed anchors, HTTP and javascript links with example evidence',()=>{
 const html='<html lang="en"><head><title>Example page title with good length</title></head><body><h1>Home</h1><a href="/empty"><span aria-hidden="true"></span></a><a href="http://example.com/old">Old link</a><a href="javascript:void(0)">Action</a></body></html>';
 const r=inspectSeoHtml(html,'https://example.com/');
 for(const code of ['links_missing_name','links_http','links_javascript'])assert.ok(r.findings.some(x=>x.code===code),code);
 assert.ok(r.findings.find(x=>x.code==='links_missing_name').message.includes('/empty'));
});
test('accessible text labels, aria labels, and image alt prevent empty link warnings',()=>{
 const html='<html><body><h1>Home</h1><a href="/home">Home</a><a href="/search" aria-label="Search"><svg></svg></a><a href="/photo"><img src="/photo.jpg" alt="Photo"></a></body></html>';
 const r=inspectSeoHtml(html,'https://example.com/');
 assert.ok(!r.findings.some(x=>x.code==='links_missing_name'));
});
test('partial HTML captures do not receive link penalties',()=>{
 const html='<html><body><a href="http://example.com"><span></span></a></body></html>';
 const r=inspectSeoHtml(html,'https://example.com/',{partial:true});
 assert.ok(r.findings.some(x=>x.code==='links_unverified'));
 assert.ok(!r.findings.some(x=>['links_missing_name','links_http','links_javascript'].includes(x.code)));
});

test('reports malformed JSON-LD without claiming schema validity',()=>{
 const html='<html><head><title>Structured data error example</title></head><body><h1>Example</h1><script type="application/ld+json">{"@type":"Organization",}</script></body></html>';
 const r=inspectSeoHtml(html,'https://example.com/');
 assert.ok(r.findings.some(x=>x.code==='invalid_json_ld'));
});
test('accepts typed JSON-LD graph and detects untyped JSON-LD',()=>{
 const good='<html><body><h1>Example</h1><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Example"}]}</script></body></html>';
 const bad='<html><body><h1>Example</h1><script type="application/ld+json">{"@context":"https://schema.org","name":"Example"}</script></body></html>';
 assert.ok(!inspectSeoHtml(good,'https://example.com/').findings.some(x=>x.code==='json_ld_missing_type'));
 assert.ok(inspectSeoHtml(bad,'https://example.com/').findings.some(x=>x.code==='json_ld_missing_type'));
});

test('link finding evidence includes affected href and is bounded',()=>{
 const r=inspectSeoHtml('<html><body><h1>Home</h1><a href="http://example.org/old">Old</a></body></html>','https://example.com/');
 const issue=r.findings.find(x=>x.code==='links_http');
 assert.ok(issue?.evidence?.some(x=>x.attribute==='href'&&x.value==='http://example.org/old'));
 assert.ok(issue.evidence.every(x=>x.value.length<=240));
});
test('invalid JSON-LD includes script index and bounded text evidence',()=>{
 const r=inspectSeoHtml('<html><body><h1>Home</h1><script type="application/ld+json">{"@type": }</script></body></html>','https://example.com/');
 const issue=r.findings.find(x=>x.code==='invalid_json_ld');
 assert.equal(issue?.evidence?.[0]?.index,1);
 assert.ok(issue.evidence[0].snippet.includes('"@type"'));
});

test('missing image alt includes exact bounded img source evidence',()=>{
 const html='<html><body><h1>Images</h1><img src="/media/hero.jpg"><img src="/media/icon.svg" alt=""><img src="/media/portrait.png" alt="Doctor portrait"></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 const issue=report.findings.find(x=>x.code==='images_missing_alt');
 assert.equal(report.imagesMissingAlt,1);
 assert.equal(issue.evidence[0].value,'/media/hero.jpg');
 assert.ok(issue.evidence[0].snippet.includes('<img'));
 assert.ok(!issue.evidence.some(x=>x.value==='/media/icon.svg'));
});

test('classifies internal external fragment email and telephone links',()=>{
 const html='<html><body><h1>Example</h1><a href="/about">About</a><a href="https://other.test/">External</a><a href="#details">Details</a><a href="mailto:hello@example.com">Email</a><a href="tel:+123456789">Call</a></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.equal(report.linkTypes.internal,1);
 assert.equal(report.linkTypes.external,1);
 assert.equal(report.linkTypes.fragment,1);
 assert.equal(report.linkTypes.email,1);
 assert.equal(report.linkTypes.telephone,1);
 assert.equal(report.linkTypes.invalid,0);
});
test('invalid link URLs produce finding but mail and fragment links do not',()=>{
 const html='<html><body><h1>Example</h1><a href="http://[invalid">Broken</a><a href="mailto:a@example.com">Mail</a><a href="#top">Top</a></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.equal(report.linkTypes.invalid,1);
 assert.ok(report.findings.some(x=>x.code==='invalid_link_urls'));
});

test('internal link targets are resolved and deduplicated without fragments',()=>{
 const html='<html><body><h1>Example</h1><a href="/services#details">Services</a><a href="https://example.com/services">Again</a><a href="https://elsewhere.test/">External</a><a href="mailto:hi@example.com">Email</a></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 assert.deepEqual(report.internalLinkTargets,['https://example.com/services']);
});
test('relative same-origin links resolve against the current page',()=>{
 const report=inspectSeoHtml('<body><h1>Example</h1><a href="../contact?from=about#form">Contact</a></body>','https://example.com/about/team');
 assert.deepEqual(report.internalLinkTargets,['https://example.com/contact?from=about']);
});

test('unresolved href templates are findings with bounded evidence',()=>{
 const html='<html lang="en"><head><title>Example Page With Useful Descriptive Title</title></head><body><h1>Welcome</h1><a href="/services/${item.link}">Service</a><a href="/{{slug}}">Details</a></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 const finding=report.findings.find(x=>x.code==='unresolved_link_template');
 assert.equal(finding.severity,'high');
 assert.equal(finding.evidence.length,2);
 assert.ok(finding.evidence[0].value.includes('${item.link}'));
});
test('literal resolved URLs are not flagged as templates',()=>{
 const report=inspectSeoHtml('<a href="/services/root-canal">Service</a>','https://example.com/');
 assert.equal(report.findings.some(x=>x.code==='unresolved_link_template'),false);
});

test('percent encoded placeholder links are flagged without double decoding',()=>{
 const html='<html><body><h1>Heading</h1><a href="/specialties/%24%7Bitem.link%7D">Template</a><a href="/appointments?lid=%24%7Bclinic.id%7D">Appointment</a><a href="/literal/%2524%257Bnot-a-template%257D">Encoded text</a></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/');
 const issue=report.findings.find(f=>f.code==='unresolved_link_template');
 assert.equal(issue.evidence.length,2);
 assert.ok(issue.evidence.some(e=>e.value.includes('%24%7Bitem.link%7D')));
 assert.ok(!issue.evidence.some(e=>e.value.includes('%2524%257B')));
});

test('repeated trailing site branding is detected without flagging a single brand suffix',()=>{
 const repeated=inspectSeoHtml('<head><title>Root Canal Treatment in Hyderabad | JV Dental | JV Dental</title></head><body><h1>Treatment</h1></body>','https://example.com/');
 const issue=repeated.findings.find(f=>f.code==='duplicate_title_brand');
 assert.equal(issue.severity,'low');
 assert.match(issue.message,/JV Dental/);
 const normal=inspectSeoHtml('<head><title>Root Canal Treatment in Hyderabad | JV Dental</title></head><body><h1>Treatment</h1></body>','https://example.com/');
 assert.equal(normal.findings.some(f=>f.code==='duplicate_title_brand'),false);
});

test('heading skip evidence includes levels and neighboring heading labels',()=>{
 const html='<html><head><title>Dental Cases | Example Clinic</title></head><body><h1>Cases</h1><h2>Implants</h2><h4><span>Case study</span></h4></body></html>';
 const report=inspectSeoHtml(html,'https://example.com/cases');
 const finding=report.findings.find(f=>f.code==='heading_hierarchy');
 assert.equal(report.headingSkips,1);
 assert.equal(finding.evidence[0].from,'H2');
 assert.equal(finding.evidence[0].to,'H4');
 assert.equal(finding.evidence[0].previousText,'Implants');
 assert.equal(finding.evidence[0].currentText,'Case study');
});

test('JV Dental fixtures: repeated branding, long doctor metadata and heading skips are independently reported',()=>{
 const title=inspectSeoHtml('<html><head><title>Root Canal Treatment in Hyderabad | JV Dental | JV Dental</title><meta name="description" content="Example dental root canal care in Hyderabad with appointment options and treatment information for patients."></head><body><h1>Root canal</h1></body></html>','https://jvdental.com/dental-treatments/root-canal-treatment');
 assert.ok(title.findings.some(f=>f.code==='duplicate_title_brand'));
 const doctor=inspectSeoHtml('<html><head><title>Dr Nithin | JV Dental</title><meta name="description" content="First summary of doctor profile"><meta name="description" content="Second summary"></head><body><h1>Doctor</h1></body></html>','https://jvdental.com/doctors/dr-nithin');
 assert.ok(doctor.findings.some(f=>f.code==='multiple_descriptions'));
 const hierarchy=inspectSeoHtml('<html><head><title>Clinical Cases | JV Dental</title></head><body><h1>Cases</h1><h3>Guided implant case</h3></body></html>','https://jvdental.com/cases');
 const issue=hierarchy.findings.find(f=>f.code==='heading_hierarchy');
 assert.equal(issue.evidence[0].from,'H1');
 assert.equal(issue.evidence[0].to,'H3');
});
