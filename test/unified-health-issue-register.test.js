import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIssueRegister,prioritiesFromRegister} from '../public/tools/health/issue-register.js';

const url='https://example.com/';
function fixture(){
 return {sections:{
  seo:{findings:[]},qa:{findings:[]},
  links:{report:{links:[],summary:{broken:0,reachable:0,serverErrors:0,unverified:0,notChecked:0}}},
  responsive:{report:{signals:[]}},security:{report:{pages:[]}}
 }};
}
function issue(code,label,severity='medium',source=url){
 return {code,label,severity,affectedPages:[source],occurrences:2,exampleEvidence:['<meta name="description">']};
}
test('same rule shared by SEO and QA has one issue with both provenances',()=>{
 const report=fixture();
 report.sections.seo.findings=[issue('duplicate_meta','Duplicate description')];
 report.sections.qa.findings=[issue('duplicate_meta','Duplicate description')];
 const register=buildIssueRegister(report);
 assert.equal(register.items.length,1);
 assert.deepEqual(register.items[0].sources,['SEO','QA']);
 assert.equal(register.items[0].occurrences,4);
 assert.deepEqual(register.items[0].affectedPages,[url]);
 assert.equal(register.summary.medium,1);
});
test('different labels with the same code remain distinct issues',()=>{
 const report=fixture();
 report.sections.seo.findings=[issue('title','Repeated brand name')];
 report.sections.qa.findings=[issue('title','Title is missing')];
 assert.equal(buildIssueRegister(report).items.length,2);
});
test('informational observations remain in register but not action priorities',()=>{
 const report=fixture();
 report.sections.seo.findings=[issue('heading','Heading informational','info')];
 const register=buildIssueRegister(report);
 assert.equal(register.summary.informational,1);
 assert.equal(register.summary.actionable,0);
 assert.equal(prioritiesFromRegister(register).length,0);
});
test('unverified links never become confirmed HTTP failures',()=>{
 const report=fixture();
 report.sections.links.report.summary.notChecked=2;
 report.sections.links.report.summary.unverified=3;
 const register=buildIssueRegister(report);
 assert.equal(register.summary.high,0);
 assert.equal(register.summary.incomplete,1);
 assert.equal(register.items[0].verification,'not_verified');
 assert.match(register.items[0].evidence[0],/2 not checked; 3 unverified/);
});
test('confirmed HTTP 404 outranks medium HTML findings with observed evidence',()=>{
 const report=fixture();
 report.sections.seo.findings=[issue('meta','Two descriptions')];
 report.sections.links.report.links=[{classification:'broken',status:404,destination:url+'missing',referringPages:[url]}];
 const register=buildIssueRegister(report);
 const priorities=prioritiesFromRegister(register);
 assert.equal(priorities[0].source,'Links');
 assert.equal(priorities[0].priority,'high');
 assert.equal(priorities[0].verification,'observed_http');
 assert.match(priorities[0].evidence,/HTTP 404/);
});
test('source evidence is retained and bounded without modifying page scores',()=>{
 const report=fixture();
 report.sections.seo.findings=[issue('meta','Description review')];
 report.sections.seo.perPage=[{url,score:96}];
 const register=buildIssueRegister(report);
 assert.deepEqual(register.items[0].evidence,['<meta name="description">']);
 assert.equal(report.sections.seo.perPage[0].score,96);
 assert.equal(register.version,1);
});

test('incomplete source HTML snapshots appear in priorities without fabricated defects',()=>{
 const report=fixture();
 report.scope={sourcePagesUnverified:2,discoveryTruncated:false};
 const register=buildIssueRegister(report);
 assert.equal(register.summary.high,0);
 assert.equal(register.summary.incomplete,1);
 assert.equal(register.items[0].verification,'not_verified');
 assert.match(register.items[0].title,/Source HTML captures/);
 assert.match(prioritiesFromRegister(register)[0].evidence,/2 source page/);
});
test('truncated discovery is disclosed separately from measured failures',()=>{
 const report=fixture();
 report.scope={sourcePagesUnverified:0,discoveryTruncated:true};
 const register=buildIssueRegister(report);
 assert.equal(register.summary.incomplete,1);
 assert.equal(register.summary.actionable,0);
 assert.equal(register.items[0].status,'incomplete');
 assert.match(register.items[0].evidence[0],/not all site pages/);
});
