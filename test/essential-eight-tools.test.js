import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {getCatalog} from '../src/tool-registry.js';
const essential=['screenshots','seo','qa','links','responsive','accessibility','security','performance'];
test('all eight essential MiCirql tools have reachable static UI routes, without pretending all are GA',()=>{
 const catalog=getCatalog();
 assert.equal(catalog.tools.length,15,'The existing 15-tool product registry must remain intact');
 const page=readFileSync(new URL('../public/tools/index.html',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
 for(const id of essential){
  const entry=catalog.tools.find(item=>item.id===id);
  assert.ok(entry,'Missing essential tool '+id);
  assert.ok(['available','limited'].includes(entry.status),'Unimplemented essential tool '+id);
  assert.match(entry.path||'',new RegExp('^/tools/'+id+'/'));
  const staticIndex=existsSync(new URL('../public'+entry.path+'index.html',import.meta.url));
  const workerAlias=id==='screenshots'&&worker.includes("'/tools/screenshots/'")&&
   worker.includes("destination.pathname=path==='/'?'/tools/index.html':'/index.html'")&&
   existsSync(new URL('../public/index.html',import.meta.url));
  assert.ok(staticIndex||workerAlias,'Essential tool page missing: '+entry.path);
  assert.ok(page.includes('href="'+entry.path+'"'),'Dashboard must link to '+entry.path);
 }
 assert.equal(catalog.tools.find(x=>x.id==='screenshots').status,'available');
 for(const id of essential.filter(x=>x!=='screenshots')){
  assert.equal(catalog.tools.find(x=>x.id===id).status,'limited',
   'A newly implemented beta must not be misrepresented as generally available');
 }
});
test('performance and security report UIs explicitly preserve provenance and absent-field-data limits',()=>{
 const perf=readFileSync(new URL('../public/tools/performance/index.html',import.meta.url),'utf8');
 const sec=readFileSync(new URL('../public/tools/security/index.html',import.meta.url),'utf8');
 assert.match(perf,/one real navigation/i);
 assert.match(perf,/Core Web Vitals/);
 assert.match(perf,/unthrottled/);
 assert.match(sec,/Missing headers are review candidates/i);
 assert.match(sec,/not proof of a vulnerability/i);
});
