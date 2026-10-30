import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSeoHtml as server} from '../src/seo-inspector.js';
import {inspectSeoHtml as browser} from '../public/tools/seo/inspector.js';

const wrap=heading=>`<!doctype html><html lang="en"><head><title>A descriptive sample page title</title><meta name="description" content="An explanation of this particular sample page for SEO inspection testing, with enough detail to avoid short descriptions."><meta name="viewport" content="width=device-width"></head><body>${heading}</body></html>`;
const run=html=>[server(html,'https://example.org/'),browser(html,'https://example.org/')];

test('unlabelled empty H1 is reported by server and browser inspectors',()=>{
 for(const result of run(wrap('<h1>   <span> </span> </h1>'))){
  assert.equal(result.findings.filter(f=>f.code==='empty_h1').length,1);
  assert.equal(result.findings.find(f=>f.code==='empty_h1').points,0);
 }
});
test('non-empty and accessible H1s are not falsely identified as empty',()=>{
 for(const heading of ['<h1>Actual page heading</h1>','<h1 aria-label="Main heading"><span aria-hidden="true"></span></h1>']){
  for(const result of run(wrap(heading)))assert.equal(result.findings.some(f=>f.code==='empty_h1'),false);
 }
});
test('partial HTML capture does not infer an empty H1 problem',()=>{
 for(const inspect of [server,browser]){
  const result=inspect(wrap('<h1></h1>'),'https://example.org/',{partial:true});
  assert.equal(result.findings.some(f=>f.code==='empty_h1'),false);
 }
});
