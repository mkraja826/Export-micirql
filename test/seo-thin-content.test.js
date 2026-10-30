import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSeoHtml as server} from '../src/seo-inspector.js';
import {inspectSeoHtml as browser} from '../public/tools/seo/inspector.js';

const html=body=>`<!doctype html><html lang="en"><head><title>Informative page heading and title</title><meta name="description" content="This is a test description that is long enough for the SEO inspector to accept without triggering unnecessary length findings."></head><body>${body}</body></html>`;
const scan=(body,opts={})=>[server,browser].map(inspect=>inspect(html(body),'https://example.com/',opts));
test('very short substantive paragraph is an informational review only',()=>{
 for(const audit of scan('<main><h1>Brief page</h1><p>Only a little information.</p></main>')){
  const item=audit.findings.find(f=>f.code==='thin_content_review');
  assert.equal(item?.severity,'info');
  assert.equal(item?.points,0);
 }
});
test('longer substantive copy and navigation-only pages do not trigger thin-content advisory',()=>{
 const longText=Array(50).fill('relevant').join(' ');
 for(const body of [`<main><h1>Guide</h1><p>${longText}</p></main>`,'<nav><a href="/a">Home</a></nav>']){
  for(const audit of scan(body))assert.equal(audit.findings.some(f=>f.code==='thin_content_review'),false);
 }
});
test('incomplete pages do not generate missing-content warnings',()=>{
 for(const audit of scan('<main><p>Brief.</p></main>',{partial:true})){
  assert.equal(audit.findings.some(f=>f.code==='thin_content_review'),false);
 }
});
