import test from 'node:test';
import assert from 'node:assert/strict';
import {derivePriorities} from '../public/tools/health/analyzer.js';

function fixture(overrides={}){
 return {
  sections:{
   links:{report:{links:[],summary:{broken:0,serverErrors:0,notChecked:0,unverified:0}}},
   seo:{findings:[]},qa:{findings:[]},
   responsive:{report:{signals:[]}},security:{report:{pages:[]}}
  },...overrides
 };
}
const finding=(severity,label)=>({
 code:'fixture',severity,label,affectedPages:['https://example.com/page'],occurrences:2
});
test('medium SEO issue appears in executive priorities',()=>{
 const report=fixture();
 report.sections.seo.findings=[finding('medium','Two meta descriptions')];
 const priorities=derivePriorities(report);
 assert.equal(priorities.length,1);
 assert.equal(priorities[0].priority,'medium');
 assert.match(priorities[0].title,/meta descriptions/);
 assert.match(priorities[0].details,/2 detector observation/);
});
test('unchecked and unverified links remain visible without being called broken',()=>{
 const report=fixture();
 report.sections.links.report.summary.notChecked=2;
 report.sections.links.report.summary.unverified=1;
 const priorities=derivePriorities(report);
 assert.equal(priorities.length,1);
 assert.equal(priorities[0].source,'Links');
 assert.match(priorities[0].evidence,/2 not checked; 1 unverified/);
 assert.doesNotMatch(priorities[0].title,/broken/i);
});
test('informational observations are not promoted as actionable',()=>{
 const report=fixture();
 report.sections.seo.findings=[finding('info','Character limit advisory')];
 report.sections.qa.findings=[finding('low','Review title pattern')];
 const priorities=derivePriorities(report);
 assert.equal(priorities.length,1);
 assert.equal(priorities[0].priority,'low');
 assert.equal(priorities[0].source,'QA');
});
test('confirmed broken links outrank medium findings and incomplete coverage',()=>{
 const report=fixture();
 report.sections.links.report.links=[{
  classification:'broken',destination:'https://example.com/404',status:404,referringPages:['https://example.com/']
 }];
 report.sections.links.report.summary.notChecked=1;
 report.sections.seo.findings=[finding('medium','Two meta descriptions')];
 const priorities=derivePriorities(report);
 assert.equal(priorities[0].priority,'high');
 assert.match(priorities[0].title,/confirmed broken/);
 assert.ok(priorities.some(p=>p.source==='SEO'));
});
