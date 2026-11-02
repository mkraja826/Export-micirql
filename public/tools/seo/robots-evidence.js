// Interpret captured robots.txt content, never infer a file or response from page HTML.
// This is a conservative syntax/coverage check, not a Google indexing verdict.
export function inspectRobotsTxtEvidence(observation){
 const status=observation?.status;
 if(observation?.observed!==true||!Number.isInteger(status))
  return {state:'not_verified',findings:[],detail:'No verified robots.txt HTTP response'};
 if(status===404||status===410)
  return {state:'checked',status,findings:[],detail:'robots.txt returned HTTP '+status+'; no crawler directives supplied'};
 if(status>=500||status===429)
  return {state:'unverified',status,findings:[],detail:'robots.txt returned HTTP '+status+'; retry before interpreting policies'};
 if(status<200||status>=300)
  return {state:'unverified',status,findings:[],detail:'robots.txt HTTP '+status+' needs redirect/final-response review'};
 if(typeof observation.body!=='string'||observation.truncated===true||observation.body.length>500000)
  return {state:'unverified',status,findings:[],detail:'Full robots.txt text was not captured'};
 const lines=observation.body.replace(/^\uFEFF/,'').split(/\r?\n/);
 let agent=false,groups=0,rules=0;
 const issues=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i].split('#')[0].trim();
  if(!line)continue;
  const m=line.match(/^([a-z][a-z-]*)\s*:\s*(.*)$/i);
  if(!m){issues.push({code:'robots_line_unrecognized',line:i+1});continue}
  const key=m[1].toLowerCase(),value=m[2].trim();
  if(key==='user-agent'){agent=Boolean(value);groups++;if(!value)issues.push({code:'robots_empty_user_agent',line:i+1});continue}
  if(key==='allow'||key==='disallow'){
   if(!agent)issues.push({code:'robots_rule_without_agent',line:i+1});
   rules++;
  }
  // Sitemap and other extensions are allowed without a user-agent group.
 }
 return {state:'checked',status,groups,rules,findings:issues,
  detail:issues.length?issues.length+' potentially malformed robots.txt line(s); manual review required':
   'robots.txt text was inspected; no basic syntax anomalies detected'};
}
