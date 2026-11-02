// Read-only review-queue generator. It does not verify a website or label ground truth.
import {readFile,writeFile} from 'node:fs/promises';
import {createSeoReviewQueue} from '../src/seo-review-queue.js';
async function main(){
 const args=process.argv.slice(2);
 if(args.length<1||args.length>5)throw Error('Usage: node scripts/prepare-seo-review.mjs audit.json [--output draft.json] [--max 60]');
 const path=args[0], audit=JSON.parse(await readFile(path,'utf8'));
 let output=null,maxCases=60;
 for(let i=1;i<args.length;i++){
  if(args[i]==='--output'&&args[i+1])output=args[++i];
  else if(args[i]==='--max'&&args[i+1])maxCases=Number(args[++i]);
  else throw Error('Unknown or incomplete argument '+args[i]);
 }
 const review=createSeoReviewQueue(audit,{maxCases});
 const json=JSON.stringify(review,null,2)+'\n';
 if(output)await writeFile(output,json,'utf8');
 process.stdout.write(json);
}
main().catch(error=>{console.error('SEO review preparation failed:',error.message);process.exitCode=1});
