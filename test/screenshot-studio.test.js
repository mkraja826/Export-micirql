import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const studio=readFileSync(new URL('../public/tools/screenshots/studio.js',import.meta.url),'utf8');
test('Screenshot Studio exposes quick, full-page and bulk capture modes',()=>{
 for(const mode of ['quick','single','bulk']){
  assert.match(html,new RegExp('data-tab="'+mode+'"'));
  assert.match(html,new RegExp('data-panel="'+mode+'"'));
 }
 assert.match(html,/id="quick"/);
 assert.match(html,/id="start"/);
 assert.match(html,/id="discover"/);
 assert.match(html,/id="progress"/);
});
test('Quick Capture uses user-permission browser capture rather than server rendering',()=>{
 assert.match(studio,/getDisplayMedia/);
 assert.match(studio,/canvas\.toBlob/);
 assert.doesNotMatch(studio,/fetch\(['"]\/api\/screenshot/);
 assert.doesNotMatch(html,/\/api\/screenshot/);
});
test('full-page and bulk modes dispatch to the first-party extension bridge',()=>{
 assert.match(studio,/MICIRQL_CAPTURE/);
 assert.match(studio,/MICIRQL_DISCOVER/);
 assert.match(studio,/MICIRQL_CAPTURE_PROGRESS/);
 assert.match(studio,/data\.zip/);
 assert.match(html,/manifest\.json/);
});
