// Chromium A4 PDF regression for Accessibility Studio's read-only evidence.
// Synthetic controls and language checks; NOT a WCAG conformance or real-site claim.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const source=(await readFile(resolve('public/tools/accessibility/index.html'),'utf8'))
 .replace(/<script type="module" src="\/tools\/accessibility\/app\.js"><\/script>/,'');
const dir=resolve('dist/accessibility-pdf-fixtures');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(source,{waitUntil:'load'});
 await page.evaluate(()=>{
  document.getElementById('results').hidden=false;
  document.getElementById('website').textContent='https://fixture.example';
  document.getElementById('report-date').textContent='Synthetic source and browser evidence test';
  const metrics=document.getElementById('metrics');
  for(const [label,value] of [['Complete source pages','58 / 60'],
   ['Source review signals',45],['Browser review signals',9],['Browser checks observed','8 / 9']]){
   const node=document.createElement('div');node.className='metric';
   const strong=document.createElement('strong');strong.textContent=value;
   const small=document.createElement('span');small.textContent=label;
   node.append(strong,small);metrics.append(node);
  }
  document.getElementById('coverage').textContent='2 of 60 pages were not verified. The report does not certify WCAG conformance.';
  function finding(id,title,details){
   const item=document.createElement('div');item.className='finding';
   const strong=document.createElement('strong');strong.textContent=title;
   const small=document.createElement('small');small.textContent=details;
   item.append(strong,small);document.getElementById(id).append(item);
  }
  finding('source-findings','Form control might lack an accessible name · 6 occurrences',
    '3 affected pages: https://fixture.example/contact');
  finding('source-findings','No nonempty language declaration on the HTML element · 4 occurrences',
    '4 affected pages: https://fixture.example/');
  document.getElementById('browser-summary').textContent='8 of 9 sampled viewport checks were verified; keyboard traversal and color contrast were not tested.';
  finding('browser-findings','Visible buttons with no detected accessible name · 5',
    '375px · https://fixture.example/contact · manual review required');
  for(let i=0;i<24;i++){
   const item=document.createElement('div');item.className='page';
   const heading=document.createElement('h3');heading.textContent='https://fixture.example/page-'+i;
   const details=document.createElement('p');details.className='small';
   details.textContent=i===23?'Source unverified · Chrome timeout; this is not a pass':
    'Source inspected · 2 review signals · language: en';
   item.append(heading,details);document.getElementById('pages').append(item);
  }
  for(const note of ['Color contrast ratios were not verified','Screen-reader and real keyboard behavior require manual verification',
   'This source-only and sampled-browser review cannot certify WCAG conformance']){
   const item=document.createElement('li');item.textContent=note;document.getElementById('manual').append(item);
  }
 });
 const rendered=await page.locator('#metrics .metric span').allTextContents();
 if(!rendered.includes('Source review signals'))throw Error('Rendered report lost the source metric label');
 const output=resolve(dir,'accessibility-evidence.pdf');
 await writeFile(output,await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true}));
 const pdfText=execFileSync('pdftotext',['-layout',output,'-'],{encoding:'utf8',maxBuffer:5_000_000}).replace(/\s+/g,' ');
 for(const phrase of ['Accessibility Studio Report','Observed source signals','Browser observation samples',
  'https://fixture.example/page-23','WCAG conformance','Color contrast ratios were not verified']){
  if(!pdfText.includes(phrase))throw Error('Accessibility PDF omitted '+phrase);
 }
 const pages=Number(execFileSync('pdfinfo',[output],{encoding:'utf8'}).match(/^Pages:\s*(\d+)/m)?.[1]||0);
 if(pages<2||pages>20)throw Error('Unexpected accessibility report page count '+pages);
 const last=execFileSync('pdftotext',['-f',String(pages),'-l',String(pages),output,'-'],{encoding:'utf8'});
 if(last.trim().length<35)throw Error('Accessibility PDF has a blank final page');
 if(errors.length)throw Error('Accessibility PDF browser errors: '+errors.join('; '));
 console.log('Accessibility A4 PDF evidence and manual limitations: '+pages+' pages, last page nonblank');
}finally{await browser.close()}
