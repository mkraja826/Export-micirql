// Chromium print-to-PDF regression for SEO Studio, using synthetic audit reports.
// Requires Playwright Chromium and pdftotext (installed in Verify MiCirql Tools).
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {summarizeSeoSiteHealth} from '../public/tools/seo/site-health.js';
import {assessSeoSiteRisk} from '../public/tools/seo/site-risk.js';
import {summarizeSeoTechnicalCoverage} from '../public/tools/seo/technical-coverage.js';

const source=await readFile(resolve('public/tools/seo/index.html'),'utf8');
const start=source.indexOf('function printClientSeoReport(report){');
const end=source.indexOf('sitePrintButton.addEventListener',start);
if(start<0||end<=start)throw Error('SEO Studio PDF printing function not found');
let printedHtml='';
const printer=new Function('window','alert','summarizeSeoSiteHealth','assessSeoSiteRisk','summarizeSeoTechnicalCoverage',
 source.slice(start,end)+';return printClientSeoReport;')(
 {open:()=>({document:{open(){},write(html){printedHtml=html},close(){}}})},
 ()=>{throw Error('PDF popup unexpectedly blocked')},summarizeSeoSiteHealth,assessSeoSiteRisk,summarizeSeoTechnicalCoverage);
const home='https://fixture.example/';
const page=(url,i)=>({url,requestedUrl:url,pageRole:'public',auditStatus:'complete',partial:false,score:i===0?80:98,
 title:'Fixture page '+i,description:'Synthetic benchmark',findings:[]});
const urls=Array.from({length:32},(_,i)=>i?home+'service-'+i:home);
const pages=urls.map(page);
const report=(extra={})=>({website:home,generatedAt:'2026-11-02T12:00:00Z',scoringVersion:'micirql-seo-v3.3',
 reports:pages,pagesSelected:32,failures:[],coverage:{},...extra});
const cases=[
 {name:'high-risk-unverified',data:report({issueCenter:Array.from({length:5},(_,i)=>({code:'case_'+i,severity:'high',affectedUrls:[urls[i]],recommendation:'Inspect and verify this issue'}))}),
  must:['Website risk assessment: Needs attention','97/100','5 high-severity','await verification','not a clean bill of health']},
 {name:'verified-critical',data:report({issueCenter:[{code:'http_noindex',severity:'high',affectedUrls:[home],verifiedAffectedUrls:[home],recommendation:'Review homepage indexability'}]}),
  must:['Technical verification coverage','Not checked does not mean passed','Risk category: critical','1 explicitly verified high-severity issue group','97/100']},
 {name:'technical-evidence',data:report({
  robotsTxtEvidence:{observed:true,status:200,body:'User-agent: *\nDisallow: /private'},
  failures:[{url:home+'lost',category:'dns_resolution_failed',navigationError:{errorCode:'net::ERR_NAME_NOT_RESOLVED'}}],
  externalLinkCoverage:{discovered:3,selected:3,truncated:false},
  externalLinkDiagnostics:[
   {destination:'https://external.example/gone',classification:'broken',status:404,referringPages:[home+'service-1']},
   {destination:'https://external.example/working',classification:'reachable',status:200,referringPages:[home]},
   {destination:'https://external.example/blocked',classification:'unverified',status:null,referringPages:[home]}
  ],issueCenter:[]
 }),
  // pdftotext -layout can interleave columns when a long table-cell label wraps.
  // Assert full labels in the rendered HTML, plus distinct evidence snippets in PDF text.
  mustHtml:['robots.txt syntax and crawl directives','DNS resolution and crawl failures',
   '1 browser-observed DNS resolution failure'],
  must:['Technical verification coverage','robots.txt','DNS resolution','External link verification',
   '1 confirmed broken external destination','https://external.example/gone',
   'https://fixture.example/service-1','Timeouts and blocked checks are not counted as broken']},
 {name:'incomplete',data:report({pagesSelected:35,failures:[{url:home+'missing',reason:'Navigation timed out'}],coverage:{discoveryTruncated:true},issueCenter:[]}),
  must:['Audit evidence incomplete','No numeric website-health score has been assigned','97/100']}
];
await mkdir(resolve('dist/seo-pdf-fixtures'),{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const item of cases){
  printedHtml='';printer(item.data);
  if(!printedHtml.includes('Executive summary'))throw Error(item.name+': missing report HTML');
  for(const phrase of item.mustHtml||[])if(!printedHtml.includes(phrase))throw Error(item.name+': report HTML missing '+phrase);
  const tab=await browser.newPage({viewport:{width:1100,height:800}});
  const errors=[];tab.on('pageerror',e=>errors.push(e.message));
  await tab.setContent(printedHtml,{waitUntil:'load'});
  const pdf=await tab.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  const file=resolve('dist/seo-pdf-fixtures/'+item.name+'.pdf');
  await writeFile(file,pdf);
  const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8',maxBuffer:5_000_000}).replace(/\s+/g,' ');
  for(const phrase of item.must)if(!text.includes(phrase))throw Error(item.name+': PDF missing '+phrase);
  if(errors.length)throw Error(item.name+': page errors '+errors.join('; '));
  const count=Number(execFileSync('pdfinfo',[file],{encoding:'utf8'}).match(/^Pages:\s*(\d+)/m)?.[1]||0);
  if(count<1)throw Error(item.name+': missing PDF pages');
  const final=execFileSync('pdftotext',['-f',String(count),'-l',String(count),file,'-'],{encoding:'utf8'});
  if(final.trim().length<50)throw Error(item.name+': last PDF page blank or nearly blank');
  console.log(item.name+': '+count+' A4 PDF page(s); evidence and final-page checks passed');
  await tab.close();
 }
}finally{await browser.close()}
