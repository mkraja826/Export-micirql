const base=(process.env.MICIRQL_BASE_URL||'https://tools.micirql.com').replace(/\/$/,'');
const checks=[
 ['/api/health',async r=>{const d=await r.json();if(!d.ok||d.presets!==3||!d.browserConfigured)throw Error('Health response invalid or browser binding missing')}],
 ['/api/presets',async r=>{const d=await r.json();if(!Array.isArray(d)||d.length!==3)throw Error('Expected 3 width presets')}],
 ['/',async r=>{const t=await r.text();if(!t.includes('MiCirql')||!t.includes('Screenshot Studio'))throw Error('Tool homepage missing')}],
 ['/robots.txt',async r=>{if(!(await r.text()).includes('sitemap.xml'))throw Error('robots.txt missing sitemap')}],
 ['/sitemap.xml',async r=>{const t=await r.text();if(!t.includes('full-page-screenshot/')||!t.includes('responsive-website-testing/'))throw Error('Sitemap incomplete')}],
 ['/full-page-screenshot/',async r=>{if(!(await r.text()).includes('Full-Page Website Screenshots'))throw Error('Guide missing')}],
 ['/responsive-website-testing/',async r=>{if(!(await r.text()).includes('Responsive Website Screenshot Testing'))throw Error('Guide missing')}],
];
checks.push(['/tools/screenshots/',async r=>{const t=await r.text();if(!t.includes('Screenshot')||!t.includes('MiCirql'))throw Error('Screenshot Studio missing')}]);
let failures=0;
for(const [path,verify] of checks){
 try{const r=await fetch(base+path,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);await verify(r);console.log('PASS',path)}
 catch(e){failures++;console.error('FAIL',path,e.message)}
}
if(failures)process.exitCode=1;
