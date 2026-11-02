import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRobotsTxtEvidence} from '../public/tools/seo/robots-evidence.js';
import {summarizeSeoTechnicalCoverage} from '../public/tools/seo/technical-coverage.js';
test('unknown robots evidence never implies successful validation',()=>{
 assert.equal(inspectRobotsTxtEvidence(null).state,'not_verified');
 assert.equal(inspectRobotsTxtEvidence({observed:true,status:200}).state,'unverified');
 assert.equal(inspectRobotsTxtEvidence({observed:true,status:200,body:'User-agent: *',truncated:true}).state,'unverified');
});
test('verified robots text reports malformed lines as review candidates only',()=>{
 const finding=inspectRobotsTxtEvidence({observed:true,status:200,body:'Disallow: /private\nUser-agent: *\nAllow: /\nBroken Directive'});
 assert.equal(finding.state,'checked');
 assert.deepEqual(finding.findings.map(f=>f.code),['robots_rule_without_agent','robots_line_unrecognized']);
 assert.equal(finding.rules,2);
});
test('robots 404 is not wrongly reported as broken website indexing',()=>{
 const v=inspectRobotsTxtEvidence({observed:true,status:404});
 assert.equal(v.state,'checked');
 assert.deepEqual(v.findings,[]);
});
test('server errors and rate limits remain unverified',()=>{
 assert.equal(inspectRobotsTxtEvidence({observed:true,status:503}).state,'unverified');
 assert.equal(inspectRobotsTxtEvidence({observed:true,status:429}).state,'unverified');
});
test('report technical coverage includes robots response only when supplied',()=>{
 const base={reports:[]};
 assert.equal(summarizeSeoTechnicalCoverage(base).checks[1].state,'not_checked');
 const checked=summarizeSeoTechnicalCoverage({...base,robotsTxtEvidence:{observed:true,status:200,body:'User-agent: *\nDisallow: /private'}});
 assert.equal(checked.checks[1].state,'checked');
 assert.equal(checked.checks[1].detail.includes('no basic syntax anomalies'),true);
});
