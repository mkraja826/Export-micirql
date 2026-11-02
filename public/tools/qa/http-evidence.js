// Classify browser-observed main-document HTTP evidence without probing the URL again.
// A captured HTML error page is not a successful QA inspection of the requested page.
export function classifyQaHttpEvidence(response){
 const raw=response?.httpEvidence;
 const observed=raw?.observed===true&&raw?.observationState==='response_observed';
 const status=observed&&Number.isInteger(raw?.status)&&raw.status>=100&&raw.status<=599?raw.status:null;
 const statusVerified=status!==null;
 const httpError=statusVerified&&status>=400;
 let reason=null;
 if(httpError){
  if(status===404||status===410)reason='Confirmed HTTP '+status+' response: the requested page was not available.';
  else if(status===401||status===403)reason='Confirmed HTTP '+status+' response: access to this page is restricted.';
  else if(status===429)reason='Confirmed HTTP 429 response: the website rate-limited this request.';
  else if(status>=500)reason='Confirmed HTTP '+status+' response: the website returned a server error.';
  else reason='Confirmed HTTP '+status+' response: the website returned a client error.';
 }
 return {
  status,statusVerified,httpError,reason,
  statusLabel:statusVerified?'Observed HTTP '+status:'HTTP status not observed',
  // Unknown means unknown, even if a rendered HTML document was captured.
  confidence:statusVerified?'verified':'unverified'
 };
}
