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

test('Quick Capture waits for a video frame and rejects oversized screenshots',()=>{
 assert.match(studio,/requestVideoFrameCallback/);
 assert.match(studio,/video\.readyState/);
 assert.match(studio,/MAX_QUICK_PIXELS/);
 assert.match(studio,/track\.readyState==='ended'/);
 assert.match(studio,/getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
});
test('website does not request Cloudflare Browser Rendering from any screenshot mode',()=>{
 assert.doesNotMatch(html,/fetch\(['"]\/api\/screenshot/);
 assert.doesNotMatch(studio,/\/api\/screenshot/);
 assert.match(studio,/MICIRQL_CAPTURE/);
});

test('discovery and full-page capture require a connected extension',()=>{
 assert.match(studio,/if\(!connected\)throw Error\('Install the free MiCirql extension to discover all website pages/);
 assert.match(studio,/\$\('#discover'\)\.disabled=!connected/);
 assert.match(studio,/\$\('#start'\)\.disabled=!connected/);
});

test('website distinguishes incompatible installed extensions from supported ones',()=>{
 assert.match(studio,/data\.protocol===2/);
 assert.match(studio,/capabilities\.includes\(cap\)/);
 assert.match(studio,/extension is outdated/);
 assert.match(studio,/outdated=!connected/);
});

test('website locks capture controls during discovery and download operations',()=>{
 assert.match(studio,/function syncControls\(\)/);
 assert.match(studio,/const busy=!!activeRequest/);
 assert.match(studio,/\$\('#url'\)\.disabled=busy/);
 assert.match(studio,/\$\('#format'\)\.disabled=busy/);
 assert.match(studio,/\[name=width\],\.page-check,\[data-tab\]/);
 assert.match(studio,/activeRequest=\{id,type\};syncControls\(\)/);
 assert.match(studio,/activeRequest=null;syncControls\(\)/);
});
