import test from 'node:test';
import assert from 'node:assert/strict';
import {csvRows,seoPagesCsv,seoIssuesCsv} from '../public/tools/seo/csv-export.js';
test('CSV escapes commas, quotes, newlines and spreadsheet formula-like text as quoted data',()=>{
 const csv=csvRows([['URL','Value'],['https://example.com/?a=1,2','A "quoted"\nline'],['=SUM(1,1)','literal']]);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.match(csv,/"A ""quoted""\nline"/);
 assert.match(csv,/"https:\/\/example.com\/\?a=1,2"/);
});
test('page export preserves zero scores and distinguishes partial audits',()=>{
 const csv=seoPagesCsv({reports:[{url:'https://example.com/',score:0,partial:true,findings:[{severity:'high'}]}]});
 assert.match(csv,/"0","","yes","1","1","0","0","0"/);
});
test('issue export emits one row per affected URL and safely quotes recommendations',()=>{
 const csv=seoIssuesCsv({issueCenter:[{severity:'high',code:'missing_title',recommendation:'Use "unique" titles',affectedUrls:['https://example.com/','https://example.com/about'],fixGuide:{verificationRequired:true}}]});
 assert.match(csv,/"Use ""unique"" titles"/);
 assert.match(csv,/"https:\/\/example.com\/about"/);
 assert.equal(csv.split('\r\n').length,4);
});
