import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {summarizeQaReport} from '../public/tools/qa/report-summary.js';

const issue=(code,severity='medium',message='Review this issue')=>({code,severity,message});
const page=(url,findings=[],partial=false)=>({url,partial,auditStatus:partial?'partial':'complete',findings});

test('QA report prioritizes complete-HTML issue groups by severity then affected-page count',()=>{
 const report={reports:[
  page('https://site.test/',[issue('missing_h1','low'),issue('empty_button'),issue('empty_button')]),
  page('https://site.test/about',[issue('missing_h1','low'),issue('unnamed_link')]),
  page('https://site.test/contact',[issue('empty_button'),issue('missing_h1','low')]),
  page('https://site.test/partial',[issue('duplicate_id'),issue('missing_h1')],true)
 ]};
 const value=summarizeQaReport(report);
 assert.equal(value.completePages,3);
 assert.equal(value.partialPages,1);
 assert.equal(value.completeFindings,7);
 assert.equal(value.provisionalFindings,2);
 assert.deepEqual(value.issues.map(x=>x.code),['empty_button','unnamed_link','missing_h1']);
 assert.equal(value.issues[0].affectedPages,2);
 assert.equal(value.issues[0].occurrences,3);
 assert.equal(value.issues[2].affectedPages,3);
 assert.equal(value.issues.some(x=>x.code==='duplicate_id'),false);
 assert.deepEqual(value.issues[0].examplePages,['https://site.test/','https://site.test/contact']);
});

test('QA provisional-only and failed scans never create confirmed HTML priorities',()=>{
 const result=summarizeQaReport({reports:[page('https://site.test/slow',[issue('unlabelled_control')],true)],
  failures:[{url:'https://site.test/error',reason:'Timed out'}]});
 assert.equal(result.completePages,0);
 assert.equal(result.partialPages,1);
 assert.equal(result.failedPages,1);
 assert.equal(result.completeFindings,0);
 assert.equal(result.provisionalFindings,1);
 assert.deepEqual(result.issues,[]);
});

test('QA report preserves informational findings without promoting them to urgent errors',()=>{
 const result=summarizeQaReport({reports:[page('https://site.test/',[
  issue('new_tab_without_noopener','info'),
  issue('unknown_observation','unknown')
 ])]});
 assert.equal(result.issues.length,2);
 assert.ok(result.issues.every(item=>item.severity==='info'));
 assert.equal(result.issues[0].affectedPages,1);
 assert.ok(result.issues.some(item=>item.label==='unknown observation'));
});

test('QA report caps example URLs without losing affected-page counts or mutating the source',()=>{
 const pages=Array.from({length:17},(_,index)=>page('https://site.test/page-'+index,[issue('empty_button')]));
 const original=JSON.stringify(pages);
 const report=summarizeQaReport({reports:pages,failures:[]});
 assert.equal(report.issues[0].affectedPages,17);
 assert.equal(report.issues[0].occurrences,17);
 assert.equal(report.issues[0].examplePages.length,3);
 assert.equal(JSON.stringify(pages),original);
});

test('QA printable report includes a distinct executive priority and provisional section',()=>{
 const html=readFileSync(new URL('../public/tools/qa/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8');
 for(const id of ['priority-section','priority-title','priority-count','priority-findings','provisional-summary',
  'page-list-summary','layout-details','layout-summary'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/@page\{\s*size:A4;\s*margin:15mm 13mm 16mm;/);
 assert.match(html,/@top-left\{/);
 assert.match(html, /@bottom-right\{/);
 assert.match(html, /counter\(page\)/);
 assert.match(html, /counter\(pages\)/);
 assert.match(html,/#results\[hidden\]\{display:none!important\}/);
 assert.match(html,/break-inside:avoid/);
 assert.match(app,/summarizeQaReport\(report\)/);
 assert.match(app,/evidenceSummary\.completeFindings/);
 assert.match(app,/evidenceSummary\.provisionalFindings/);
 assert.match(app,/window\.addEventListener\('beforeprint'/);
 assert.match(app,/window\.addEventListener\('afterprint'/);
 assert.match(app,/querySelectorAll\('details'\)/);
});

function makeElement(tag='div'){
 return {tagName:tag,hidden:false,disabled:false,open:false,dataset:{},textContent:'',children:[],
  addEventListener(){},
  append(...children){this.children.push(...children)},
  replaceChildren(...children){this.children=[...children]},
  querySelectorAll(selector){
   if(selector!=='details')return [];
   const found=[];
   const visit=item=>{
    if(item.tagName==='details')found.push(item);
    for(const child of item.children)visit(child);
   };
   for(const child of this.children)visit(child);
   return found;
  }};
}
function makeRenderer(){
 const source=readFileSync(new URL('../public/tools/qa/app.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'');
 const elements=new Map(),handlers=new Map();
 const document={
  getElementById(id){if(!elements.has(id))elements.set(id,makeElement());return elements.get(id)},
  createElement:makeElement,addEventListener(){}
 };
 const window={
  addEventListener(type,handler){handlers.set(type,handler)},
  removeEventListener(){},postMessage(){},print(){}
 };
 const sandbox={document,window,location:{origin:'https://tools.micirql.com',search:''},URL,URLSearchParams,
  Date,Math,Promise,Number,Set,JSON,console,
  summarizeQaReport,inspectQaHtml(){return {}},selectQaLayoutSamples(){return []},
  setTimeout(){return 1},clearTimeout(){}};
 runInNewContext(source+'\nthis.__render=render;',sandbox);
 return {render:sandbox.__render,elements,handlers};
}

test('QA UI ranks complete snapshot findings and explicitly separates provisional/failed pages',()=>{
 const h=makeRenderer();
 h.render({website:'https://site.test',generatedAt:'2026-11-02T00:00:00.000Z',inspectorVersion:'micirql-qa-v1.1',
  pagesSelected:4,pagesAnalyzed:2,partialPages:1,truncated:false,layoutPagesVerified:0,failures:[{url:'https://site.test/error',reason:'timeout'}],
  reports:[
   page('https://site.test/quiet',[]),
   page('https://site.test/partial',[issue('duplicate_id')],true),
   page('https://site.test/home',[issue('empty_button'),issue('unlabelled_control')])
  ]});
 const id=x=>h.elements.get(x);
 assert.equal(id('priority-findings').children.length,2);
 assert.match(id('priority-count').textContent,/2 of 2 issue types/);
 assert.match(id('provisional-summary').textContent,/1 partial HTML capture/);
 assert.match(id('provisional-summary').textContent,/1 failed page capture/);
 assert.equal(id('metrics').children[1].children[0].textContent,'2');
 const details=id('pages').children;
 assert.match(details[0].children[0].textContent,/\/home/);
 assert.match(details[1].children[0].textContent,/\/quiet/);
 assert.match(details[2].children[0].textContent,/provisional observation/);
 assert.match(details[3].children[0].textContent,/not checked/);
});

test('QA print opens closed details to include all findings then restores expanded state',()=>{
 const h=makeRenderer();
 h.render({website:'https://site.test',generatedAt:'2026-11-02T00:00:00.000Z',inspectorVersion:'micirql-qa-v1.1',
  pagesSelected:1,pagesAnalyzed:1,partialPages:0,truncated:false,layoutPagesVerified:0,failures:[],
  reports:[page('https://site.test/home',[issue('empty_button')])]});
 const details=h.elements.get('pages').children[0];
 assert.equal(details.open,false);
 h.handlers.get('beforeprint')();
 assert.equal(details.open,true);
 h.handlers.get('afterprint')();
 assert.equal(details.open,false);
});
