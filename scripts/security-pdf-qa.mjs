// Chromium A4 regression for Security Inspector's passive read-only report.
// Synthetic fixture only: not a security scan of a real website.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const html=(await readFile(resolve('public/tools/security/index.html'),'utf8'))
 .replace(/<script type="module" src="\/tools\/security\/app\.js"><\/script>/,'');
const dir=resolve('dist/security-pdf-fixtures');
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(html,{waitUntil:'load'});
 await page.evaluate(()=>{
  document.getElementById('results').hidden=false;
  document.getElementById('website').textContent='https://fixture.example';
  document.getElementById('date').textContent='Synthetic passive-response evidence';
  const metrics=document.getElementById('metrics');
  for(const [label,value] of [['HTTP responses assessed','2 / 3'],['Observed header signals',6],
   ['Configuration review candidates',7],['Redirects / HTTP errors / unverified',1]]){
   const node=document.createElement('div');node.className='metric';
   const big=document.createElement('strong');big.textContent=value;
   const small=document.createElement('span');small.textContent=label;
   node.append(big,small);metrics.append(node);
  }
  document.getElementById('scope').textContent='Sampled three public pages. Missing headers are configuration review candidates and do not prove vulnerabilities.';
  const pages=document.getElementById('pages');
  for(const [url,state] of [['https://fixture.example/','observed'],['https://fixture.example/about','observed'],['https://fixture.example/contact','unverified']]){
   const section=document.createElement('section');section.className='page';
   const h=document.createElement('h3');h.textContent=url;
   const description=document.createElement('p');description.className='small';
   description.textContent=state==='observed'?'Observed HTTP 200 response headers':'Network timeout; HTTP response unverified';
   section.append(h,description);
   if(state==='observed'){
    for(const [title,detail] of [['HTTP Strict Transport Security','HSTS header observed, strength requires review'],
     ['Content Security Policy','No CSP response header observed; context matters'],
     ['MIME sniffing protection','X-Content-Type-Options nosniff observed'],
     ['Frame embedding protection','CSP frame-ancestors observed; authorization values require review']]){
     const item=document.createElement('div');item.className='review';
     const strong=document.createElement('strong');strong.textContent=title;
     const p=document.createElement('p');p.textContent=detail;item.append(strong,p);
     section.append(item);
    }
   }
   pages.append(section);
  }
  for(const t of ['Passive response headers only, no penetration testing',
   'No TLS certificate or DNS security verification',
   'A header present does not prove the website is secure',
   'Unverified requests are not successful checks']){
   const li=document.createElement('li');li.textContent=t;
   document.getElementById('limitations').append(li);
  }
 });
 const rendered=await page.locator('#metrics .metric span').allTextContents();
 if(!rendered.includes('Configuration review candidates'))throw Error('Security report metric missing from HTML');
 const output=resolve(dir,'passive-header-review.pdf');
 await writeFile(output,await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true}));
 const text=execFileSync('pdftotext',['-layout',output,'-'],{encoding:'utf8',maxBuffer:5000000}).replace(/\s+/g,' ');
 for(const phrase of ['Security Inspector Report','Observed configuration','Content Security Policy',
  'https://fixture.example/contact','No TLS certificate or DNS security verification']){
  if(!text.includes(phrase))throw Error('Security PDF missing '+phrase);
 }
 const count=Number(execFileSync('pdfinfo',[output],{encoding:'utf8'}).match(/^Pages:\s*(\d+)/m)?.[1]||0);
 if(count<1||count>12)throw Error('Security report pagination invalid: '+count);
 const last=execFileSync('pdftotext',['-f',String(count),'-l',String(count),output,'-'],{encoding:'utf8'});
 if(last.trim().length<35)throw Error('Security report final PDF page blank');
 if(errors.length)throw Error('Security report browser errors: '+errors.join('; '));
 console.log('Security Inspector A4 passive report checks passed: '+count+' page(s)');
}finally{await browser.close()}
