// Chromium A4 PDF regression for the Performance Lab one-navigation report.
// Synthetic timing/resource fixtures only; not real-world Core Web Vitals.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const markup=(await readFile(resolve('public/tools/performance/index.html'),'utf8'))
 .replace(/<script type="module" src="\/tools\/performance\/app\.js"><\/script>/,'');
const dir=resolve('dist/performance-pdf-fixtures');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1080,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(markup,{waitUntil:'load'});
 await page.evaluate(()=>{
  document.getElementById('results').hidden=false;
  document.getElementById('website').textContent='https://fixture.example/';
  document.getElementById('date').textContent='Synthetic unthrottled Chrome measurement';
  document.getElementById('scope').textContent='One navigation observed. This is not a Lighthouse performance score or field Core Web Vitals.';
  const metrics=document.getElementById('metrics');
  for(const [name,value] of [['Response start','153 ms'],['Response end','210 ms'],
   ['DOM content ready','420 ms'],['Load event','860 ms'],
   ['First Contentful Paint','Not observed']]){
   const div=document.createElement('div');div.className='metric';
   const strong=document.createElement('strong');strong.textContent=value;
   const span=document.createElement('span');span.textContent=name;div.append(strong,span);metrics.append(div);
  }
  document.getElementById('resource-summary').textContent=
   '20 resources inspected; 7 with reported transfer size; 13 hidden or zero sizes; 45.1 KiB reported. Partial resource timing, not total page bytes.';
  for(const [type,count] of [['script','4'],['css','2'],['img','7'],['font','1'],
   ['fetch','2'],['xmlhttprequest','0'],['link','1'],['other','3']]){
   const div=document.createElement('div');div.className='item';
   const strong=document.createElement('strong');strong.textContent=count;
   const small=document.createElement('small');small.textContent=type;div.append(strong,small);
   document.getElementById('resource-types').append(div);
  }
  document.getElementById('cwv').textContent=
   'LCP: not measured · CLS: not measured · INP: not measured. FCP is not LCP.';
  for(const note of ['One observation without simulated throttling or cold-cache control',
   'First Contentful Paint can be unavailable in background tabs',
   'Cross-origin resource sizes can be hidden; reported bytes are partial',
   'No field Core Web Vitals, Lighthouse score, or guaranteed visually complete state']){
   const li=document.createElement('li');li.textContent=note;
   document.getElementById('limitations').append(li);
  }
 });
 const names=await page.locator('#metrics .metric span').allTextContents();
 if(!names.includes('First Contentful Paint'))throw Error('FCP report label missing from rendered HTML');
 const path=resolve(dir,'one-navigation-report.pdf');
 await writeFile(path,await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true}));
 const content=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8',maxBuffer:5000000})
  .replace(/\s+/g,' ');
 for(const required of ['Performance Lab Report','Browser navigation timeline',
  'Not observed','Resource timing evidence','Core Web Vitals coverage','not measured',
  'Cross-origin resource sizes can be hidden']){
  if(!content.includes(required))throw Error('Performance PDF omitted '+required);
 }
 const pages=Number(execFileSync('pdfinfo',[path],{encoding:'utf8'}).match(/^Pages:\s*(\d+)/m)?.[1]||0);
 if(pages<1||pages>10)throw Error('Unexpected Performance Lab PDF page count: '+pages);
 const last=execFileSync('pdftotext',['-f',String(pages),'-l',String(pages),path,'-'],{encoding:'utf8'});
 if(last.trim().length<35)throw Error('Performance Lab A4 PDF has a blank last page');
 if(errors.length)throw Error('Performance Lab report browser errors: '+errors.join('; '));
 console.log('Performance Lab A4 report: '+pages+' page(s), missing FCP and field-data caveats preserved');
}finally{await browser.close()}
