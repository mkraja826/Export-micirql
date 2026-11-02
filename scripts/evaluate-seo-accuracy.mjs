// Offline accuracy evaluation against independently checked URL-level labels.
// Example: node scripts/evaluate-seo-accuracy.mjs --pair audit.json labels.json
// Repeat --pair for multiple websites. No live fetching or site mutation.
import {readFile,writeFile} from 'node:fs/promises';
import {evaluateSeoDetectionAccuracy} from '../src/seo-accuracy-evaluation.js';
async function main(){
 const argv=process.argv.slice(2),pairs=[];
 let output=null,enforce=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--pair'){
   if(!argv[i+1]||!argv[i+2])throw Error('--pair requires audit.json labels.json');
   const audit=JSON.parse(await readFile(argv[++i],'utf8'));
   const groundTruth=JSON.parse(await readFile(argv[++i],'utf8'));
   pairs.push({audit,groundTruth});
  }else if(argv[i]==='--output'){
   if(!argv[i+1])throw Error('--output requires a path');
   output=argv[++i];
  }else if(argv[i]==='--enforce')enforce=true;
  else throw Error('Unknown argument '+argv[i]);
 }
 const result=evaluateSeoDetectionAccuracy(pairs);
 const json=JSON.stringify(result,null,2)+'\n';
 if(output)await writeFile(output,json,'utf8');
 process.stdout.write(json);
 if(enforce&&!result.targetMet)process.exitCode=1;
}
main().catch(error=>{console.error('Accuracy evaluation failed:',error.message);process.exitCode=1});
