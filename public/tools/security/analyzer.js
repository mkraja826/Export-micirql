// MiCirql passive Security Inspector. No attack traffic, no credentialed requests,
// no TLS/certificate conclusions, no security grade and no inferred vulnerabilities.
export const SECURITY_PAGE_SAMPLE_LIMIT=3;
export const SECURITY_ALLOWED_HEADERS=Object.freeze([
 'strict-transport-security','content-security-policy','x-content-type-options',
 'referrer-policy','permissions-policy','x-frame-options','cross-origin-opener-policy'
]);
function clean(value){
 try{
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  // Localhost, IP literals and non-public local suffixes are out of scope for this beta.
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
   host.endsWith('.internal')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':'))return null;
  u.username='';u.password='';u.search='';u.hash='';
  return u.href;
 }catch{return null}
}
function isSafePage(value){
 const url=new URL(value);
 // We never issue security-probe GETs to actions, downloads, admin or auth routes.
 if(/\.(?:pdf|zip|png|jpe?g|gif|svg|webp|css|js|json|xml|mp4|webm|woff2?)$/i.test(url.pathname))return false;
 return !/(?:^|\/)(?:api|logout|log-out|signout|sign-out|delete|remove|destroy|edit|admin|login|signin|signup|register|account|auth|checkout|purchase|payment|reset-password|unsubscribe|cancel|download|export)(?:\/|$)/i.test(url.pathname);
}
export function chooseSecurityPages(rawPages,website,limit=SECURITY_PAGE_SAMPLE_LIMIT){
 if(!Number.isInteger(limit)||limit<1||limit>SECURITY_PAGE_SAMPLE_LIMIT)
  throw Error('Security sample limit must be 1–3');
 const entry=clean(website);if(!entry||!isSafePage(entry))throw Error('Enter a public website URL');
 const origin=new URL(entry).origin;
 const urls=[...new Set([entry,...(Array.isArray(rawPages)?rawPages:[])]
  .map(clean).filter(url=>url&&new URL(url).origin===origin&&isSafePage(url)))].slice(0,60);
 const chosen=[entry];
 const priority=urls.find(url=>url!==entry&&/\/(?:contact|contact-us)(?:\/|$)/i.test(new URL(url).pathname))
  ||urls.find(url=>url!==entry&&/\/(?:about|services|products|blog)(?:\/|$)/i.test(new URL(url).pathname));
 if(priority)chosen.push(priority);
 for(const url of urls)if(chosen.length<limit&&!chosen.includes(url))chosen.push(url);
 return {website:entry,discoveredCandidatePages:urls.length,selectedPages:chosen,
  selectionLimited:urls.length>chosen.length};
}
function normalizeHeaders(raw){
 const headers={};
 for(const key of SECURITY_ALLOWED_HEADERS){
  const value=typeof raw?.[key]==='string'?raw[key].trim().slice(0,2048):'';
  if(value)headers[key]=value;
 }
 return headers;
}
function row(code,label,state,detail){return {code,label,state,detail}}
function inspectHeaderRows(url,headers){
 const https=new URL(url).protocol==='https:',csp=headers['content-security-policy']||'';
 const xfo=headers['x-frame-options']||'',hsts=headers['strict-transport-security']||'';
 const checks=[
  row('https_scheme','HTTPS request scheme',https?'observed':'review',
   https?'The requested page used an HTTPS URL; certificate validity was not inspected':'The requested page used an HTTP URL; no encryption was established for this request'),
  row('hsts','HTTP Strict Transport Security',!https?'not_applicable':hsts?'observed':'review',
   !https?'HSTS is meaningful only over verified HTTPS responses':hsts?
   'HSTS header observed; policy duration and preload status are not certified':'No HSTS header in the observed response; review transport policy'),
  row('csp','Content Security Policy',csp?'observed':'review',
   csp?'A CSP response header was observed; actual script behavior and policy strength need separate review':
   'No enforced Content-Security-Policy response header observed; impact depends on the application'),
  row('nosniff','MIME type sniffing protection',
   /^nosniff$/i.test(headers['x-content-type-options']||'')?'observed':'review',
   /^nosniff$/i.test(headers['x-content-type-options']||'')?
    'X-Content-Type-Options: nosniff was observed':'The response did not contain X-Content-Type-Options: nosniff'),
  row('referrer','Referrer policy',headers['referrer-policy']?'observed':'review',
   headers['referrer-policy']?'Referrer-Policy header observed; policy suitability not assessed':
    'No Referrer-Policy header observed; browser defaults may still apply'),
  row('permissions','Permissions policy',headers['permissions-policy']?'observed':'review',
   headers['permissions-policy']?'Permissions-Policy header observed; directives were not certified':
   'No Permissions-Policy response header observed; this is optional for many sites'),
  row('framing','Frame embedding protection',
   /(?:^|;)\s*frame-ancestors\s+[^;]+/i.test(csp)||/^(?:deny|sameorigin)$/i.test(xfo)?'observed':'review',
   /(?:^|;)\s*frame-ancestors\s+[^;]+/i.test(csp)?
    'CSP frame-ancestors directive observed; authorization values still require review':
    /^(?:deny|sameorigin)$/i.test(xfo)?'X-Frame-Options restriction observed':
    'No recognized frame-ancestors or X-Frame-Options restriction observed; embedding may be intentional'),
  row('coop','Cross-Origin Opener Policy',headers['cross-origin-opener-policy']?'observed':'informational',
   headers['cross-origin-opener-policy']?'COOP header observed; cross-origin isolation not assessed':
   'COOP is not required by every website')
 ];
 if(https&&hsts){
  const max=hsts.match(/(?:^|;)\s*max-age\s*=\s*(\d+)/i);
  if(!max){
   const check=checks.find(x=>x.code==='hsts');
   check.state='review';
   check.detail='HSTS header observed without a valid max-age directive; the policy may be ineffective.';
  }
  else if(Number(max[1])===0){
   const check=checks.find(x=>x.code==='hsts');
   check.state='review';
   check.detail='HSTS max-age=0 observed; this disables HSTS persistence. Confirm whether intended.';
  }
 }
 return checks;
}
export function assessSecurityResponse({requestedUrl,observation}){
 const url=clean(requestedUrl);if(!url)throw Error('Invalid public inspection URL');
 const status=observation?.ok===true&&observation?.observed===true&&
  Number.isInteger(observation.status)&&observation.status>=100&&observation.status<=599?
  observation.status:null;
 const responseUrl=clean(observation?.url||url);
 if(responseUrl&&responseUrl!==url)return {url,status:null,state:'unverified',reason:'unexpected_response_url',checks:[],headers:{}};
 if(status===null)return {url,status:null,state:'unverified',
  reason:String(observation?.reason||observation?.error||'http_response_not_observed').slice(0,130),checks:[],headers:{}};
 if(status>=300&&status<400)return {url,status,state:'redirect',reason:'redirect_not_followed',
  location:typeof observation?.location==='string'?observation.location.slice(0,250):null,checks:[],headers:{}};
 if(status<200||status>=300)return {url,status,state:'http_error',
  reason:'http_'+status+'_not_assessed_for_header_completeness',checks:[],headers:{}};
 const headers=normalizeHeaders(observation?.headers);
 const checks=inspectHeaderRows(url,headers);
 return {url,status,state:'observed',reason:null,headers,checks,
  note:'Response headers only. Browser-side GET with omitted credentials; response body not retained.'};
}
export function buildSecurityReport({website,observations=[],discoveredPages=0,discoveryTruncated=false}){
 const entry=clean(website);if(!entry)throw Error('Invalid public website URL');
 if(!Array.isArray(observations)||observations.length>SECURITY_PAGE_SAMPLE_LIMIT)
  throw Error('Too many security observations');
 const origin=new URL(entry).origin,seen=new Set(),pages=[];
 for(const item of observations){
  const url=clean(item?.requestedUrl);
  if(!url||new URL(url).origin!==origin||seen.has(url)||!isSafePage(url))
   throw Error('Invalid, duplicate or unsafe sampled URL');
  seen.add(url);
  pages.push(assessSecurityResponse({requestedUrl:url,observation:item.response}));
 }
 const count=state=>pages.filter(row=>row.state===state).length;
 const checked=pages.filter(row=>row.state==='observed').flatMap(row=>row.checks);
 return {schemaVersion:1,tool:'security',generatedAt:new Date().toISOString(),
  website:origin,scope:{discoveredPages,discoveryTruncated:discoveryTruncated===true,
   sampledPages:pages.length,selectionLimited:discoveredPages>pages.length,
   observedResponses:count('observed'),redirectsNotFollowed:count('redirect'),
   httpErrors:count('http_error'),unverified:count('unverified')},
  summary:{observedHeaderChecks:checked.filter(x=>x.state==='observed'&&x.code!=='https_scheme').length,
   reviewCandidates:checked.filter(x=>x.state==='review').length},
  pages,limitations:[
   'Passive browser-side HTTP response inspection only; no vulnerability exploitation or penetration testing',
   'No TLS certificate, DNS, cookie attributes, authentication, open ports, or server configuration verification',
   'Missing headers are contextual review candidates, not confirmed exploitable vulnerabilities',
   'Only sampled public page URLs were checked; response redirects are not silently followed or scored',
   'A header present is not proof that its policy is correct, nor proof the website is secure'
  ]};
}
