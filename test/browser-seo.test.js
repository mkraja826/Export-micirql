import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectSeoHtml as serverInspector} from '../src/seo-inspector.js';
import {inspectSeoHtml as browserInspector} from '../public/tools/seo/inspector.js';

test('browser and server inspectors remain identical',()=>{
 const source=readFileSync(new URL('../src/seo-inspector.js',import.meta.url),'utf8');
 const browser=readFileSync(new URL('../public/tools/seo/inspector.js',import.meta.url),'utf8');
 assert.equal(browser,source,'Sync browser inspector after modifying the shared SEO logic');
});

test('browser SEO inspector produces the same findings as server',()=>{
 const html='<html lang="en"><head><title>Sample</title><meta name="description" content="Page"><meta name="viewport" content="width=device-width"></head><body><h1>Welcome</h1></body></html>';
 const url='https://example.com/';
 assert.deepEqual(browserInspector(html,url),serverInspector(html,url));
 assert.ok(browserInspector(html,url).findings.some(x=>x.code==='missing_canonical'));
});

test('browser SEO inspector enforces the size limit',()=>{
 assert.throws(()=>browserInspector('x'.repeat(1000001),'https://example.com/'),/under 1 MB/);
});
