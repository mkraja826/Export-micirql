// QA Lab report prioritization: complete HTML evidence only.
// Partial captures and failed pages are separately disclosed, never ranked as verified findings.
const SEVERITY_ORDER={medium:0,low:1,info:2};
const ISSUE_LABELS={
 unlabelled_control:'Form field name needs review',
 empty_button:'Unnamed button',
 unnamed_link:'Unnamed link',
 missing_image_alt:'Image description needs review',
 missing_h1:'Missing main heading',
 heading_jump:'Heading order',
 duplicate_id:'Duplicate element ID',
 empty_link_target:'Placeholder link destination',
 missing_anchor:'Unresolved in-page anchor',
 new_tab_without_noopener:'New-tab link advisory'
};
export function summarizeQaReport(report){
 const pages=Array.isArray(report?.reports)?report.reports:[];
 const failures=Array.isArray(report?.failures)?report.failures:[];
 const grouped=new Map();
 let completePages=0,partialPages=0,completeFindings=0,provisionalFindings=0;
 for(const page of pages){
  if(!page||typeof page!=='object')continue;
  const findings=Array.isArray(page.findings)?page.findings:[];
  if(page.partial===true||page.auditStatus==='partial'){
   partialPages++;
   provisionalFindings+=findings.length;
   continue;
  }
  if(page.auditStatus&&page.auditStatus!=='complete')continue;
  completePages++;
  completeFindings+=findings.length;
  const pageUrl=String(page.url||page.requestedUrl||'Unknown page');
  for(const finding of findings){
   if(!finding||typeof finding.code!=='string')continue;
   const severity=Object.hasOwn(SEVERITY_ORDER,finding.severity)?finding.severity:'info';
   const key=severity+':'+finding.code;
   let group=grouped.get(key);
   if(!group){
    group={code:finding.code,severity,label:ISSUE_LABELS[finding.code]||finding.code.replaceAll('_',' '),
     message:String(finding.message||'Review the page evidence.'),
     occurrences:0,pages:new Set()};
    grouped.set(key,group);
   }
   group.occurrences++;
   group.pages.add(pageUrl);
  }
 }
 const issues=[...grouped.values()].map(item=>({...item,affectedPages:item.pages.size,
  examplePages:[...item.pages].slice(0,3)}));
 issues.sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]
  ||b.affectedPages-a.affectedPages||b.occurrences-a.occurrences||a.code.localeCompare(b.code));
 return {completePages,partialPages,failedPages:failures.length,completeFindings,
  provisionalFindings,issueTypes:issues.length,issues};
}
