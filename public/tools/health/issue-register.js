// Evidence-backed issue register for the unified website report.
// This is a report index, not an independent detector or a site-health score.
const norm=s=>String(s??'').trim().replace(/\s+/g,' ');
const grade=s=>['high','medium','low','info'].includes(String(s).toLowerCase())?
 String(s).toLowerCase():'review';
const uniq=values=>[...new Set(values.filter(Boolean))];
const rank={high:0,medium:1,low:2,review:3,info:4};
export function buildIssueRegister(report){
 const groups=new Map();
 const add=({key,title,severity,source,urls=[],evidence=[],occurrences=1,verification='review_signal',status='finding'})=>{
  if(!key)return;
  let item=groups.get(key);
  if(!item){
   item={id:key,title:norm(title),severity:grade(severity),status,verification,
    sources:[],affectedPages:[],evidence:[],occurrences:0};
   groups.set(key,item);
  }
  if(rank[grade(severity)]<rank[item.severity])item.severity=grade(severity);
  item.sources=uniq([...item.sources,source]);
  item.affectedPages=uniq([...item.affectedPages,...urls]);
  item.evidence=uniq([...item.evidence,...evidence.map(norm)]).slice(0,5);
  item.occurrences+=Number.isFinite(occurrences)?Math.max(0,occurrences):1;
 };
 for(const source of ['seo','qa']){
  for(const finding of report.sections?.[source]?.findings||[]){
   const code=norm(finding.code||'other');
   const label=norm(finding.label||code);
   // Only merge cross-module matches when the detector code AND label agree.
   // Different rules and unrelated warnings must never be silently collapsed.
   const key='html:'+code.toLowerCase()+':'+label.toLowerCase();
   add({key,title:label,severity:finding.severity,source:source.toUpperCase(),
    urls:finding.affectedPages||[],evidence:finding.exampleEvidence||[],
    occurrences:finding.occurrences||0,verification:'source_html',status:'finding'});
  }
 }
 for(const link of report.sections?.links?.report?.links||[]){
  if(!['broken','server_error'].includes(link.classification))continue;
  const url=norm(link.destination),code=link.classification;
  add({key:'http:'+code+':'+url,title:code==='broken'?'Fix confirmed broken internal destination':'Investigate observed server error',
   severity:'high',source:'Links',urls:[url],
   evidence:['HTTP '+String(link.status),...(link.referringPages||[]).slice(0,3).map(x=>'Linked from '+x)],
   verification:'observed_http',status:'finding'});
 }
 const summary=report.sections?.links?.report?.summary||{};
 if(summary.notChecked||summary.unverified)
  add({key:'coverage:internal-links',title:'Internal destinations need verification',
   severity:'review',source:'Links',status:'incomplete',verification:'not_verified',
   evidence:[(summary.notChecked||0)+' not checked; '+(summary.unverified||0)+' unverified']});
 for(const issue of report.sections?.responsive?.report?.signals||[]){
  if(issue.code!=='document_horizontal_overflow')continue;
  add({key:'responsive:overflow:'+norm(issue.url)+':'+String(issue.width),
   title:'Review horizontal document overflow',severity:'review',source:'Responsive',
   urls:[issue.url],evidence:[String(issue.width)+'px: '+norm(issue.summary)],
   verification:'browser_signal'});
 }
 for(const page of report.sections?.security?.report?.pages||[]){
  for(const issue of page.checks||[]){
   if(issue.state!=='review'||!['hsts','csp','nosniff'].includes(issue.code))continue;
   add({key:'security:'+issue.code+':'+norm(page.url),title:'Review '+norm(issue.label),
    severity:'review',source:'Security',urls:[page.url],evidence:[norm(issue.detail)],
    verification:'header_review'});
  }
 }
 const items=[...groups.values()].sort((a,b)=>
  (rank[a.severity]??3)-(rank[b.severity]??3)||
  a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 return {version:1,items,summary:{
  actionable:items.filter(x=>x.status==='finding'&&['high','medium','low'].includes(x.severity)).length,
  high:items.filter(x=>x.status==='finding'&&x.severity==='high').length,
  medium:items.filter(x=>x.status==='finding'&&x.severity==='medium').length,
  low:items.filter(x=>x.status==='finding'&&x.severity==='low').length,
  review:items.filter(x=>x.severity==='review').length,
  informational:items.filter(x=>x.severity==='info').length,
  incomplete:items.filter(x=>x.status==='incomplete').length
 }};
}
export function prioritiesFromRegister(register){
 const priorityRank={high:0,medium:1,low:2,review:3};
 return (register?.items||[])
  .filter(x=>x.severity!=='info')
  .sort((a,b)=>(priorityRank[a.severity]??4)-(priorityRank[b.severity]??4))
  .slice(0,25).map(item=>({
   priority:item.severity,source:item.sources.join(' / '),title:item.title,
   evidence:item.evidence[0]||item.affectedPages[0]||'Review affected page evidence',
   details:item.affectedPages.length+' affected page(s); '+item.occurrences+' occurrence(s)',
   issueId:item.id,verification:item.verification,status:item.status
  }));
}
