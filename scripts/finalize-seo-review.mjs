// Convert a human-reviewed copy of a generated SEO review draft to benchmark labels.
// The original draft is an immutable reference; this CLI performs no network checks.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {finalizeSeoReviewDraft} from '../src/seo-review-finalization.js';

async function main(){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i++){
  const key=args[i];
  if(!['--original','--reviewed','--output'].includes(key)||options[key]||!args[i+1]||
   args[i+1].startsWith('--'))
   throw Error('Usage: node scripts/finalize-seo-review.mjs --original review-draft.json --reviewed reviewed-copy.json --output labels.json');
  options[key]=args[++i];
 }
 if(args.length!==6||!options['--original']||!options['--reviewed']||!options['--output'])
  throw Error('Specify --original, --reviewed and --output');
 const originalPath=resolve(options['--original']),reviewedPath=resolve(options['--reviewed']);
 const outputPath=resolve(options['--output']);
 if(originalPath===reviewedPath||outputPath===originalPath||outputPath===reviewedPath)
  throw Error('Original, reviewed, and output files must be separate; do not overwrite audit evidence');
 const original=JSON.parse(await readFile(originalPath,'utf8'));
 const reviewed=JSON.parse(await readFile(reviewedPath,'utf8'));
 const output=finalizeSeoReviewDraft(original,reviewed);
 await writeFile(outputPath,JSON.stringify(output,null,2)+'\n','utf8');
 console.log(JSON.stringify({written:outputPath,
  reviewedCases:output.provenance.reviewedCaseCount,
  unknownCases:output.provenance.unknownCaseCount,
  independentReviewSignoffRequired:true,
  note:'Evidence and reviewer identity are self-reported, not independently authenticated.'},null,2));
}
main().catch(error=>{console.error('SEO review finalization failed:',error.message);process.exitCode=1});
