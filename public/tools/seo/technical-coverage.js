import {inspectRobotsTxtEvidence} from './robots-evidence.js';
// Evidence coverage is distinct from an SEO pass/fail score.
export function summarizeSeoTechnicalCoverage(report){
 const reports=Array.isArray(report?.reports)?report.reports:[];
 const publicPages=reports.filter(p=>(p?.pageRole||'public')==='public');
 const httpVerified=publicPages.filter(p=>p?.httpVerification?.verified===true).length;
 const links=Array.isArray(report?.linkDiagnostics)?report.linkDiagnostics:null;
 const verifiedLinks=links?.filter(x=>['reachable','broken','server_error'].includes(x.classification)).length||0;
 const unknownLinks=links?.filter(x=>!['reachable','broken','server_error'].includes(x.classification)).length||0;
 const robots=inspectRobotsTxtEvidence(report?.robotsTxtEvidence);
 const failures=Array.isArray(report?.failures)?report.failures:[];
 const dnsVerified=failures.filter(f=>f?.navigationError?.errorCode==='net::ERR_NAME_NOT_RESOLVED'&&f.category==='dns_resolution_failed').length;
 const dnsTimeouts=failures.filter(f=>f?.navigationError?.errorCode==='net::ERR_DNS_TIMED_OUT').length;
 const failuresUnclassified=failures.length-dnsVerified-dnsTimeouts;
 const dnsState=dnsVerified?'checked':failures.length?'partial':'not_checked';
 const dnsDetail=dnsVerified?dnsVerified+' browser-observed DNS resolution failure(s); '+dnsTimeouts+' DNS timeout(s); '+failuresUnclassified+' other crawl failure(s)':
  failures.length?dnsTimeouts+' DNS timeout(s) and '+failuresUnclassified+' other crawl failure(s); no confirmed DNS resolution error':
  'No browser-observed DNS failure; successful page captures do not prove site-wide DNS health';
 const checks=[
  {name:'Main-document HTTP response',state:httpVerified===0?'not_verified':httpVerified===publicPages.length?'checked':'partial',detail:httpVerified+' of '+publicPages.length+' public-page HTTP responses verified'},
  {name:'robots.txt syntax and crawl directives',state:robots.state==='not_verified'&&!report?.robotsTxtEvidence?'not_checked':robots.state,detail:robots.detail},
  {name:'DNS resolution and crawl failures',state:dnsState,detail:dnsDetail},
  {name:'External link destination verification',state:!links?'not_checked':verifiedLinks===0?'not_verified':unknownLinks?'partial':'checked',detail:links?verifiedLinks+' confirmed destination responses; '+unknownLinks+' unverified':'No destination verification evidence is attached to this report'}
 ];
 return {version:'micirql-technical-coverage-v1',checks,allChecked:checks.every(c=>c.state==='checked')};
}
