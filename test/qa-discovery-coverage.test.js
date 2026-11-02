import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeQaDiscovery} from '../public/tools/qa/discovery-coverage.js';

const base='https://example.com/';
const selected=['https://example.com/','https://example.com/contact'];

test('QA separates known failed discovery URLs from successfully selected pages',()=>{
 const source={ok:true,scanned:4,pages:selected,errors:[
  {url:'https://example.com/blocked',message:'Navigation timed out'},
  {url:'https://example.com/gone',message:'Chrome could not open the page'}
 ]};
 const r=summarizeQaDiscovery(base,source,selected);
 assert.equal(r.status,'incomplete');
 assert.equal(r.selected,2);
 assert.equal(r.scanned,4);
 assert.equal(r.failed,2);
 assert.equal(r.reportedUnaccounted,0);
 assert.equal(r.truncated,false);
 assert.deepEqual(r.errors.map(x=>x.url),['https://example.com/blocked','https://example.com/gone']);
 assert.match(r.errors[0].reason,/Navigation timed out/);
});
test('QA does not include cross-origin failures, duplicates or URLs already inspected successfully',()=>{
 const r=summarizeQaDiscovery(base,{ok:true,scanned:3,errors:[
  {url:'https://other.example/private',message:'Offsite'},
  {url:'https://example.com/blocked#first',message:'Timed out'},
  {url:'https://example.com/blocked#second',message:'Duplicate'},
  {url:'https://example.com/contact',message:'Already selected'},
  {url:'javascript:alert(1)',message:'Invalid URL'},
  {url:'https://example.com/missing',message:'Timed out'}
 ]},selected);
 assert.equal(r.failed,2);
 assert.deepEqual(r.errors.map(x=>x.url),['https://example.com/blocked','https://example.com/missing']);
 assert.equal(r.status,'incomplete');
});
test('QA never treats unknown discovery attempts, missing scan counts or a 60-page truncation as healthy',()=>{
 const withoutCounts=summarizeQaDiscovery(base,{ok:true,pages:selected},selected);
 assert.equal(withoutCounts.status,'incomplete');
 assert.equal(withoutCounts.scanned,null);
 assert.equal(withoutCounts.reportedUnaccounted,null);
 const unexplained=summarizeQaDiscovery(base,{ok:true,scanned:5,errors:[]},selected);
 assert.equal(unexplained.reportedUnaccounted,3);
 assert.equal(unexplained.status,'incomplete');
 const truncated=summarizeQaDiscovery(base,{ok:true,scanned:2,truncated:true},selected);
 assert.equal(truncated.status,'incomplete');
 assert.equal(truncated.truncated,true);
 const impossible=summarizeQaDiscovery(base,{ok:true,scanned:1},selected);
 assert.equal(impossible.inconsistentCount,true);
 assert.equal(impossible.status,'incomplete');
});
test('QA supports a fully completed discovery without claiming whole-site completeness',()=>{
 const r=summarizeQaDiscovery(base,{ok:true,scanned:2,errors:[],truncated:false},selected);
 assert.equal(r.status,'completed');
 assert.equal(r.selected,2);
 assert.equal(r.failed,0);
 assert.match(r.limitation,/reachable, same-origin pages/);
});
test('QA returns printable unverified evidence when discovery fails completely',()=>{
 const r=summarizeQaDiscovery(base,{ok:false,error:'Chrome navigation timed out',scanned:0,errors:[]},[]);
 assert.equal(r.status,'incomplete');
 assert.equal(r.selected,0);
 assert.equal(r.scanned,0);
 assert.equal(r.failed,0);
 assert.match(r.error,/Chrome navigation timed out/);
 const empty=summarizeQaDiscovery(base,{ok:true,scanned:0},[]);
 assert.equal(empty.status,'incomplete');
});
test('QA discovery errors are bounded to a 60-page public website cap',()=>{
 const rows=Array.from({length:110},(_,i)=>({url:'https://example.com/broken/'+i,message:'X'.repeat(400)}));
 const r=summarizeQaDiscovery(base,{ok:true,scanned:60,errors:rows},[]);
 assert.equal(r.errors.length,60);
 assert.equal(r.errors[0].reason.length,240);
 assert.equal(r.status,'incomplete');
});
test('QA report has an explicit, printable discovery section independent of HTML failures',()=>{
 const html=readFileSync(new URL('../public/tools/qa/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 for(const id of ['discovery-section','discovery-title','discovery-summary','discovery-errors'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/summarizeQaDiscovery\(url\.href,discovered,pages\)/);
 assert.match(app,/discovery:?[ ,]/);
 assert.match(app,/discovery\.errors/);
 assert.match(app,/discovery-errors'\)\.querySelectorAll\('details'\)/);
 assert.match(app,/unreached pages have no QA findings/i);
});
