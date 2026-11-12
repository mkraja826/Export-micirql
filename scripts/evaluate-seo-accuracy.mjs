// Offline accuracy evaluation against independently checked URL-level labels.
// Example: node scripts/evaluate-seo-accuracy.mjs --pair audit.json labels.json
// Repeat --pair for multiple websites. No live fetching or site mutation.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {evaluateSeoDetectionAccuracy} from '../src/seo-accuracy-evaluation.js';
import {renderSeoCoverageMarkdown} from '../src/seo-benchmark-coverage-report.js';
async function main(){
 const argv=process.argv.slice(2),pairs=[],inputs=[];
 let output=null,coverageOutput=null,enforce=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--pair'){
   if(!argv[i+1]||!argv[i+2]||argv[i+1].startsWith('--')||argv[i+2].startsWith('--'))
    throw Error('--pair requires audit.json labels.json');
   const auditPath=argv[++i],labelsPath=argv[++i];
   inputs.push(resolve(auditPath),resolve(labelsPath));
   const audit=JSON.parse(await readFile(auditPath,'utf8'));
   const groundTruth=JSON.parse(await readFile(labelsPath,'utf8'));
   pairs.push({audit,groundTruth});
  }else if(argv[i]==='--output'){
   if(!argv[i+1]||argv[i+1].startsWith('--')||output)throw Error('--output requires one path');
   output=argv[++i];
  }else if(argv[i]==='--coverage-output'){
   if(!argv[i+1]||argv[i+1].startsWith('--')||coverageOutput)
    throw Error('--coverage-output requires one path');
   coverageOutput=argv[++i];
  }else if(argv[i]==='--enforce')enforce=true;
  else throw Error('Unknown argument '+argv[i]);
 }
 const outputPaths=[output,coverageOutput].filter(Boolean).map(p=>resolve(p));
 if(new Set(outputPaths).size!==outputPaths.length||outputPaths.some(p=>inputs.includes(p)))
  throw Error('Benchmark outputs must be distinct from each other and all audit/label inputs');
 const result=evaluateSeoDetectionAccuracy(pairs);
 const json=JSON.stringify(result,null,2)+'\n';
 if(output)await writeFile(output,json,'utf8');
 if(coverageOutput)await writeFile(coverageOutput,renderSeoCoverageMarkdown(result),'utf8');
 process.stdout.write(json);
 if(enforce&&!result.targetMet)process.exitCode=1;
}
main().catch(error=>{console.error('Accuracy evaluation failed:',error.message);process.exitCode=1});
