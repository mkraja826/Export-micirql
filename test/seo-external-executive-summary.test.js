import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/tools/seo/index.html',import.meta.url),'utf8');
test('PDF executive summary includes checked, unverified and unchecked external links',()=>{
 const start=html.indexOf('function printClientSeoReport(report){');
 const end=html.indexOf('sitePrintButton.addEventListener',start);
 const printer=html.slice(start,end);
 assert.match(printer,/externalExecutiveNotice=externalRows\.length/);
 assert.match(printer,/externalBroken\.length/);
 assert.match(printer,/External link check:/);
 assert.match(printer,/Not checked\. The HTML score does not cover broken external destinations/);
 assert.match(printer,/Executive summary<\/h2>'\+coverageTable\+externalExecutiveNotice/);
 assert.match(printer,/separate from the HTML page score/);
});
