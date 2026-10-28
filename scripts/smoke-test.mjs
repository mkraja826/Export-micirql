function httpFailure(response){
 const ray=response.headers.get('cf-ray');
 const server=response.headers.get('server');
 const challenge=response.headers.get('cf-mitigated');
 return ['HTTP '+response.status,server?'server='+server:null,ray?'cf-ray='+ray:null,challenge?'cf-mitigated='+challenge:null].filter(Boolean).join(' | ');
}
const base=(process.env.MICIRQL_BASE_URL||'https://tools.micirql.com').replace(/\/$/,'');
const checks=[
 ['/extension/micirql-tools-extension.zip',async r=>{const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length<1000||bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('Extension download is not a valid ZIP (bytes='+bytes.length+')')}],
 ['/extension/micirql-tools-extension.zip?utm_source=chatgpt.com',async r=>{const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length<1000||bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('Extension download is not a valid ZIP (bytes='+bytes.length+')')}],
 ['/api/health',async r=>{const d=await r.json();if(!d.ok||d.presets!==3)throw Error('Health response invalid')}],
 ['/api/presets',async r=>{const d=await r.json();if(!Array.isArray(d)||d.length!==3)throw Error('Expected 3 width presets')}],
 ['/',async r=>{const t=await r.text();if(!t.includes('MiCirql')||!t.includes('Screenshot Studio'))throw Error('Tool homepage missing')}],
 ['/robots.txt',async r=>{if(!(await r.text()).includes('https://tools.micirql.com/sitemap.xml'))throw Error('robots.txt missing sitemap')}],
 ['/sitemap.xml',async r=>{const t=await r.text();if(!t.includes('https://tools.micirql.com/tools/screenshots/')||!t.includes('https://tools.micirql.com/full-page-screenshot/')||t.includes('https://export.micirql.com/'))throw Error('Sitemap incomplete')}],
 ['/full-page-screenshot/',async r=>{if(!(await r.text()).includes('Full-Page Website Screenshots'))throw Error('Guide missing')}],
 ['/responsive-website-testing/',async r=>{if(!(await r.text()).includes('Responsive Website Screenshot Testing'))throw Error('Guide missing')}],
];
checks.push(['/tools/screenshots/',async r=>{const t=await r.text();if(!t.includes('Screenshot')||!t.includes('MiCirql'))throw Error('Screenshot Studio missing')}]);
checks.push(['/tools/seo/',async r=>{const t=await r.text();for(const marker of ['MiCirql SEO Studio','site-export-pdf','site-audit-history','site-progress-report','Print progress report / Save PDF'])if(!t.includes(marker))throw Error('SEO Studio missing marker: '+marker)}]);
// A freshly uploaded ZIP may not be available at every Cloudflare edge immediately.
// Retry only transient HTTP outcomes for this downloadable asset; a sustained 404
// or an invalid ZIP must still fail the deployment.
const extensionPath='/extension/micirql-tools-extension.zip';
const extensionRetryDelaysMs=[0,3000,6000,10000,15000];
const retryableExtensionStatuses=new Set([404,429,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runCheck(path,verify){
 const isExtension=path.startsWith(extensionPath);
 const delays=isExtension?extensionRetryDelaysMs:[0];
 for(let attempt=0;attempt<delays.length;attempt++){
  if(delays[attempt])await sleep(delays[attempt]);
  const response=await fetch(base+path,{signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!response.ok){
   const failure=httpFailure(response);
   if(isExtension&&retryableExtensionStatuses.has(response.status)&&attempt<delays.length-1){
    console.warn('RETRY',path,failure,'attempt '+(attempt+2)+' of '+delays.length);
    continue;
   }
   throw Error(failure);
  }
  await verify(response);
  console.log('PASS',path);
  return;
 }
}
let failures=0;
for(const [path,verify] of checks){
 try{await runCheck(path,verify)}
 catch(e){failures++;console.error('FAIL',path,e.message)}
}
if(failures)process.exitCode=1;

// The legacy domain must preserve deep links while redirecting website traffic.
try{
 const legacy=await fetch('https://export.micirql.com/',{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(legacy.status!==308)throw Error('Expected 308 redirect; got '+httpFailure(legacy));
 if(legacy.headers.get('location')!=='https://tools.micirql.com/tools/screenshots/')throw Error('Unexpected legacy redirect location');
 console.log('PASS legacy redirect');
}catch(e){failures++;console.error('FAIL legacy redirect',e.message)}
if(failures)process.exitCode=1;
