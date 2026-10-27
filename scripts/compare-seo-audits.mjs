import {readFileSync} from 'node:fs';
import {compareSeoAudits} from '../src/seo-benchmark-compare.js';
const [beforePath,afterPath]=process.argv.slice(2);
if(!beforePath||!afterPath){
 console.error('Usage: node scripts/compare-seo-audits.mjs old-audit.json new-audit.json');
 process.exitCode=2;
}else{
 try{
  const before=JSON.parse(readFileSync(beforePath,'utf8'));
  const after=JSON.parse(readFileSync(afterPath,'utf8'));
  console.log(JSON.stringify(compareSeoAudits(before,after),null,2));
 }catch(error){console.error(error.message);process.exitCode=1}
}
