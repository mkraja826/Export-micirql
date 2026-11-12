// Human-readable internal reviewer report; never present as certified SEO accuracy.
const percent=value=>value===null||!Number.isFinite(value)?'n/a':(value*100).toFixed(1)+'%';
const cell=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
const displayStatus=code=>code.replace(/_/g,' ');

export function renderSeoCoverageMarkdown(benchmark){
 const coverage=benchmark?.coverageReport;
 if(coverage?.version!=='micirql-benchmark-coverage-v1'||!Array.isArray(coverage.issueCodes))
  throw Error('Benchmark coverageReport is required');
 const lines=[
  '# MiCirql SEO Studio — Independent benchmark coverage',
  '',
  '**Internal reviewer report — not an independently certified accuracy claim.**',
  '',
  'Metrics reflect submitted URL-level labels only. Evidence, reviewer independence and sampling representativeness still require human verification.',
  '',
  '## Screening overview',
  '',
  '| Measure | Submitted sample |',
  '| --- | ---: |',
  '| Labeled issue codes | '+coverage.representedIssueCodes+' |',
  '| Codes meeting preliminary sampling screen | '+coverage.coverageScreenedCodes+' |',
  '| Evaluable URL-level labels | '+benchmark.eligibleLabels+' |',
  '| Abstained labels | '+benchmark.abstained+' |',
  '| Observed false positives | '+benchmark.confusion.fp+' |',
  '| Observed false negatives | '+benchmark.confusion.fn+' |',
  '| Overall precision in this sample | '+percent(benchmark.precision)+' |',
  '| Overall recall in this sample | '+percent(benchmark.recall)+' |',
  '',
  '## Coverage by issue type',
  '',
  '| SEO issue code | Eligible | Sites | Positives | Negatives | FP | FN | Precision | Recall | Sampling screen |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'
 ];
 for(const item of coverage.issueCodes){
  lines.push('| '+cell(item.code)+' | '+item.eligibleLabels+' | '+item.sites+
   ' | '+item.positives+' | '+item.negatives+
   ' | '+item.confusion.fp+' | '+item.confusion.fn+
   ' | '+percent(item.precision)+' | '+percent(item.recall)+
   ' | '+(item.screeningCoverageMet?'Preliminary coverage':'Insufficient evidence')+' |');
 }
 if(!coverage.issueCodes.length)
  lines.push('| No independently labeled issue codes supplied | 0 | 0 | 0 | 0 | 0 | 0 | n/a | n/a | Insufficient evidence |');
 lines.push('', '## Recommended review order', '');
 if(!coverage.reviewPriorities.length)
  lines.push('No unresolved screening gaps or reviewer-labeled disagreements in submitted cases. Use a held-out benchmark and human sign-off before any public claims.');
 for(const [index,item] of coverage.reviewPriorities.entries()){
  const row=coverage.issueCodes.find(r=>r.code===item.code);
  lines.push((index+1)+'. **'+cell(item.code)+'** — '+cell(item.recommendedAction)+
   ' FP: '+item.falsePositives+', FN: '+item.falseNegatives+
   '; screening gaps: '+(row.evidenceGaps.length?row.evidenceGaps.map(displayStatus).join(', '):'none')+'.');
 }
 lines.push('', '## Interpretation and limitations', '',
  '- This report lists only issue codes represented in the supplied ground-truth labels. Unlisted checks are not proven accurate or clean.',
  '- Preliminary per-code screening requires at least '+coverage.thresholds.minEligible+
   ' evaluable labels, '+coverage.thresholds.minPositive+' positives, '+coverage.thresholds.minNegative+
   ' negatives, '+coverage.thresholds.minSites+' sites, and at most '+
   percent(coverage.thresholds.maxAbstentionRate)+' abstentions.',
  '- Counts alone cannot establish 95% accuracy with statistical confidence. Reviewer independence, selection bias, site diversity and held-out performance must be assessed separately.',
  '- Reported false positives and false negatives are reviewer-labeled disagreements until evidence is independently authenticated.',
  '- No result in this document changes the production SEO score or authorizes a public accuracy claim.',
  '');
 return lines.join('\n');
}
