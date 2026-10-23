function httpFailure(response){
 const ray=response.headers.get('cf-ray');
 const server=response.headers.get('server');
 const challenge=response.headers.get('cf-mitigated');
 return ['HTTP '+response.status,server?'server='+server:null,ray?'cf-ray='+ray:null,challenge?'cf-mitigated='+challenge:null].filter(Boolean).join(' | ');
}
const base=(process.env.MICIRQL_BASE_URL||'https://tools.micirql.com').replace(/\/$/,'');
const checks=[
 ['/api/health',async r=>{const d=await r.json();if(!d.ok||d.presets!==3)throw Error('Health response invalid')}],
 ['/api/presets',async r=>{const d=await r.json();if(!Array.isArray(d)||d.length!==3)throw Error('Expected 3 width presets')}],
 ['/',async r=>{const t=await r.text();if(!t.includes('MiCirql')||!t.includes('Screenshot Studio'))throw Error('Tool homepage missing')}],
 ['/robots.txt',async r=>{if(!(await r.text()).includes('https://tools.micirql.com/sitemap.xml'))throw Error('robots.txt missing sitemap')}],
 ['/sitemap.xml',async r=>{const t=await r.text();if(!t.includes('https://tools.micirql.com/tools/screenshots/')||!t.includes('https://tools.micirql.com/full-page-screenshot/')||t.includes('https://export.micirql.com/'))throw Error('Sitemap incomplete')}],
 ['/full-page-screenshot/',async r=>{if(!(await r.text()).includes('Full-Page Website Screenshots'))throw Error('Guide missing')}],
 ['/responsive-website-testing/',async r=>{if(!(await r.text()).includes('Responsive Website Screenshot Testing'))throw Error('Guide missing')}],
];
checks.push(['/tools/screenshots/',async r=>{const t=await r.text();if(!t.includes('Screenshot')||!t.includes('MiCirql'))throw Error('Screenshot Studio missing')}]);
let failures=0;
for(const [path,verify] of checks){
 try{const r=await fetch(base+path,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(httpFailure(r));await verify(r);console.log('PASS',path)}
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
