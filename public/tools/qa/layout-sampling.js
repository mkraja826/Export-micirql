// Deterministic, bounded QA layout sampling. No network or DOM access here.
// Prefer the entered page, then a form-bearing page, then other complete pages.
export function selectQaLayoutSamples(reports,entryUrl,limit=3){
 const max=Math.min(3,Math.max(0,Math.trunc(Number(limit)||0)));
 const complete=Array.isArray(reports)?reports.filter(page=>page&&page.partial!==true&&typeof page.url==='string'):[];
 const chosen=[];
 const seen=new Set();
 const choose=page=>{
  if(!page||chosen.length>=max||seen.has(page.url))return;
  seen.add(page.url);chosen.push(page);
 };
 choose(complete.find(page=>page.requestedUrl===entryUrl||page.url===entryUrl));
 choose(complete.find(page=>Number(page.counts?.formControls)>0));
 for(const page of complete)choose(page);
 return chosen;
}
