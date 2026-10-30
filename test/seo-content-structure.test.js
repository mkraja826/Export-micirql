import test from 'node:test';
import assert from 'node:assert/strict';
import {crossPageContentAndStructureFindings} from '../public/tools/seo/audit-lifecycle.js';
import {inspectSeoHtml} from '../src/seo-inspector.js';
const origin='https://example.org';
const text=Array(55).fill('A useful explanation about a specific dental service.').join(' ');
function page(path,body,links=[]){return {url:origin+path,score:95,auditStatus:'complete',pageRole:'public',mainContentText:body,internalLinkTargets:links.map(s=>origin+s),findings:[]};}
test('identical substantive page text is detected without altering individual scores',()=>{
 const a=page('/a',text),b=page('/b',text);
 const findings=crossPageContentAndStructureFindings([a,b],origin);
 assert.equal(findings.find(x=>x.code==='duplicate_page_content')?.affectedUrls.length,2);
 assert.equal(a.score,95);
});
test('short pages do not trigger duplicate content warnings',()=>{
 const findings=crossPageContentAndStructureFindings([page('/a','Home'),page('/b','Home')],origin);
 assert.equal(findings.some(x=>x.code==='duplicate_page_content'),false);
});
test('click depth is based on recorded internal links, not URL path segments',()=>{
 const pages=[page('/',text+' root',['/1']),page('/1',text+' one',['/2']),page('/2',text+' two',['/3']),page('/3',text+' three',['/4']),page('/4',text+' four')];
 const findings=crossPageContentAndStructureFindings(pages,origin);
 assert.deepEqual(findings.find(x=>x.code==='deep_click_path')?.affectedUrls,[origin+'/4']);
});
test('inspector preserves bounded text for cross-page analysis',()=>{
 const html='<html><head><title>A unique sample page heading</title></head><body><main><p>'+text+'</p></main></body></html>';
 const result=inspectSeoHtml(html,origin+'/a');
 assert.ok(result.mainContentText.length>100);
 assert.ok(result.mainContentText.length<=5000);
});
