// MiCirql SEO signals: deterministic source/DOM-based checks; not a search ranking prediction.
export const SEO_SCORING_VERSION='micirql-seo-v3.3';
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
function attribute(tag,name){
 const re=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i');
 const m=tag.match(re);return m?decode(m[1]??m[2]??m[3]):'';
}
export function inspectSeoHtml(html,url,options={}){
 if(typeof html!=='string'||html.length>1000000)throw Error('HTML must be a string under 1 MB');
 const head=(html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)||[])[1]||html.slice(0,100000);
 const title=decode((head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)||[])[1]||'');
 const meta=[...head.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
 const links=[...head.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]);
 const findMeta=(key,value)=>{const tag=meta.find(t=>attribute(t,key).toLowerCase()===value);return tag?attribute(tag,'content'):''};
 const description=findMeta('name','description'),robots=findMeta('name','robots'),viewport=findMeta('name','viewport');
 const canonicalTags=links.filter(t=>attribute(t,'rel').toLowerCase().split(/\s+/).includes('canonical'));
 const canonicalTag=canonicalTags[0];
 const canonical=canonicalTag?attribute(canonicalTag,'href'):'';
 const htmlTag=(html.match(/<html\b[^>]*>/i)||[])[0]||'';
 const lang=attribute(htmlTag,'lang'),h1Count=[...html.matchAll(/<h1(?:\s|>)/gi)].length;
 const ogTitle=findMeta('property','og:title'),ogDescription=findMeta('property','og:description'),ogImage=findMeta('property','og:image');
 const twitterCard=findMeta('name','twitter:card');
 const imageTags=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
 const missingAltTags=imageTags.filter(t=>!/\salt\s*=/i.test(t));
 const imagesMissingAlt=missingAltTags.length;
 const structuredDataCount=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/gi)].length;
 const headingMatches=[...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)];
 const emptyH1Matches=headingMatches.filter(m=>Number(m[1])===1&&!decode(m[2].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' '))&&!/\b(?:aria-label|aria-labelledby)\s*=/i.test(m[0].split('>')[0]));
 const headingLevels=headingMatches.map(m=>Number(m[1]));
 const headingLabel=m=>decode(m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ')).slice(0,140);
 const headingEvidence=[];
 for(let i=1;i<headingMatches.length;i++)if(headingLevels[i]>headingLevels[i-1]+1)
  headingEvidence.push({element:'heading',from:'H'+headingLevels[i-1],to:'H'+headingLevels[i],previousText:headingLabel(headingMatches[i-1]),currentText:headingLabel(headingMatches[i])});
 const headingSkips=headingEvidence.length;
 const findings=[];
 const add=(code,severity,message,points=0,category='technical')=>findings.push({code,severity,message,points,category});
 const errorPage=/\b(?:cloudflare|connection timed out)\b/i.test(title)&&/\b(?:5(?:0[0-9]|2[0-9])|4(?:0[34]|2[9]))\b/.test(title)||/<title[^>]*>[^<]*(?:403 forbidden|404 not found|502 bad gateway|503 service unavailable|504 gateway timeout|522 connection timed out)[^<]*<\/title>/i.test(head)||/cf-error-code|cf-error-details|cloudflare-error-500s/i.test(html.slice(0,120000));
 const tail=html.trimEnd();
 // Detect clearly interrupted captures without assuming optional HTML closing tags are mandatory.
 const incompleteHtml=/<(?:[a-z][\w:-]*)(?:\s[^<>]*)?$/i.test(tail)||(tail.lastIndexOf('<!--')>tail.lastIndexOf('-->'))||(/<script\b/i.test(tail)&&tail.search(/<script\b/i)>-1&&tail.toLowerCase().lastIndexOf('<script')>tail.toLowerCase().lastIndexOf('</script'));
 const incompleteReasons=[];
 if(/<(?:[a-z][\w:-]*)(?:\s[^<>]*)?$/i.test(tail))incompleteReasons.push('HTML ends inside an opening tag');
 if(tail.lastIndexOf('<!--')>tail.lastIndexOf('-->'))incompleteReasons.push('Unclosed HTML comment');
 if(/<script\b/i.test(tail)&&tail.toLowerCase().lastIndexOf('<script')>tail.toLowerCase().lastIndexOf('</script'))incompleteReasons.push('Unclosed script element');
 if(options.partial===true)incompleteReasons.push('Capture reported incomplete HTML');
 const isPartial=options.partial===true||incompleteHtml;
 if(errorPage){
  return {url,title,description,robots,canonical,lang,viewport,h1Count,findings:[{code:'error_page',severity:'high',message:'The captured page appears to be an HTTP or Cloudflare error page. Audit the actual website instead.',points:0,category:'availability'}],scope:'static_html_only',scoringVersion:SEO_SCORING_VERSION,auditStatus:'invalid_error_page',score:null,maxScore:100,scoreLabel:'Not scored',partial:isPartial,scoreExplanation:'Error pages cannot receive a meaningful SEO score.'};
 }
 if(!title)add('missing_title','high','Add a descriptive page title.',20,'metadata');
 else if(title.length<15||title.length>65)add('title_length','info','Review title clarity and usefulness; Google does not enforce a fixed character limit.',0,'metadata');
 // Repeated trailing brand segments usually indicate a duplicated title template.
 const titleSegments=title.split(/\s+\|\s+/).map(x=>x.trim()).filter(Boolean);
 if(titleSegments.length>=3&&titleSegments.at(-1).toLowerCase()===titleSegments.at(-2).toLowerCase())
  add('duplicate_title_brand','low','The page title repeats its final brand segment: '+titleSegments.at(-1)+'. Review title template composition.',4,'metadata');
 if(!description)add('missing_description','low','Consider a concise, page-specific meta description. Google may generate the search snippet from visible page content instead.',4,'metadata');
 else if(description.length<70||description.length>170)add('description_length','info','Review description relevance and clarity; Google snippets have no fixed character limit.',0,'metadata');
 if(isPartial){
  add('heading_unverified','info','Heading structure is not verified in a partial HTML capture. Reinspect the fully loaded page before recommending heading changes.',0,'content');
 }else{
  if(h1Count===0)add('heading_count','low','No H1 was found. Review whether the page has a clear, descriptive visible heading; H1 tags are not a strict Google ranking requirement.',4,'content');
   else if(h1Count>1)add('heading_count','info','More than one H1 was found. Multiple H1 elements are allowed; check the page heading hierarchy for clarity.',0,'content');
  if(emptyH1Matches.length)add('empty_h1','low',emptyH1Matches.length+' H1 heading(s) contain no readable text or accessible label. Add a meaningful primary heading.',0,'content');
  if(headingSkips)add('heading_hierarchy','info','Heading levels skip steps in '+headingSkips+' place(s); review readability and accessibility rather than treating this as a Google Search ranking penalty.',0,'content');
 }
 const titleTagCount=[...head.matchAll(/<title\b[^>]*>/gi)].length;
 const descriptionTagCount=meta.filter(t=>attribute(t,'name').toLowerCase()==='description').length;
 if(titleTagCount>1)add('multiple_titles','medium',titleTagCount+' title tags found in the document head; use one unambiguous title.',6,'metadata');
 if(descriptionTagCount>1)add('multiple_descriptions','medium',descriptionTagCount+' meta description tags found; use one unambiguous description.',6,'metadata');
 if(canonicalTags.length>1){
  const canonicalValues=canonicalTags.map(tag=>attribute(tag,'href')).map(value=>{try{const candidate=new URL(value,url);candidate.hash='';return candidate.href}catch{return value.trim()}});
  if(new Set(canonicalValues).size>1)add('multiple_canonicals','high','Conflicting canonical link targets appear in the page head; verify which URL should represent this page.',12,'indexability');
  else add('repeated_canonical_tags','info','Repeated identical canonical declarations were found; these are redundant but not conflicting.',0,'indexability');
 }
 if(!canonical)add('missing_canonical','info','No HTML canonical preference was declared. Google may choose a canonical automatically; review only if duplicate URLs are a concern.',0,'indexability');
 else{try{if(!['http:','https:'].includes(new URL(canonical,url).protocol))add('canonical_invalid','medium','Canonical URL is invalid.',7,'indexability')}catch{add('canonical_invalid','medium','Canonical URL is invalid.',7,'indexability')}}
 if(!lang)add('missing_language','medium','Add the document language attribute.',5,'technical');
 if(!viewport)add('missing_viewport','medium','Add a mobile viewport meta tag.',8,'technical');
 const googlebotRobots=findMeta('name','googlebot');
 if(/\bnoindex\b/i.test(robots)||/\bnoindex\b/i.test(googlebotRobots))add('noindex','high','This page requests noindex for search crawlers; confirm it should be excluded from search.',25,'indexability');
 if(!ogTitle)add('missing_og_title','low','Add Open Graph title for social sharing.',3,'social');
 if(!ogDescription)add('missing_og_description','low','Add Open Graph description.',3,'social');
 if(!ogImage)add('missing_og_image','low','Add Open Graph image.',3,'social');
 if(!twitterCard)add('missing_twitter_card','info','Consider adding a Twitter/X card tag.',0,'social');
 if(imagesMissingAlt)add('images_missing_alt','medium',imagesMissingAlt+' image(s) lack an alt attribute.',Math.min(10,imagesMissingAlt*2),'content');
 const anchorTags=[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)];
 const linkIssues=[];
 for(const match of anchorTags){
  const tag='<a '+match[1]+'>';
  const href=attribute(tag,'href');
  const inner=match[2];
  const label=decode(inner.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
  const accessible=label||attribute(tag,'aria-label')||attribute(tag,'title')||[...inner.matchAll(/<img\b[^>]*>/gi)].map(m=>attribute(m[0],'alt')).find(Boolean)||'';
  if(!accessible&&!/aria-labelledby\s*=/i.test(tag)&&!/\b(?:sr-only|visually-hidden)\b/i.test(inner))linkIssues.push({code:'link_missing_name',href:href||'(no href)'});
  if(/^http:\/\//i.test(href))linkIssues.push({code:'link_http',href});
  if(/^javascript:/i.test(href))linkIssues.push({code:'link_javascript',href});
 }
 const linkTypes={internal:0,external:0,fragment:0,email:0,telephone:0,invalid:0,other:0};
 const invalidLinkExamples=[];
 for(const match of anchorTags){
  const href=attribute('<a '+match[1]+'>','href').trim();
  if(!href){linkTypes.other++;continue}
  if(href.startsWith('#')){linkTypes.fragment++;continue}
  if(/^mailto:/i.test(href)){linkTypes.email++;continue}
  if(/^tel:/i.test(href)){linkTypes.telephone++;continue}
  if(/^(?:javascript|data|vbscript):/i.test(href)){linkTypes.invalid++;invalidLinkExamples.push(href);continue}
  try{
   const resolved=new URL(href,url);
   if(!['http:','https:'].includes(resolved.protocol)){linkTypes.other++;continue}
   const base=new URL(url);
   linkTypes[resolved.origin===base.origin?'internal':'external']++;
  }catch{linkTypes.invalid++;invalidLinkExamples.push(href)}
 }
 if(!isPartial&&invalidLinkExamples.length)add('invalid_link_urls','medium',invalidLinkExamples.length+' link destination(s) are invalid or non-navigable. Examples: '+invalidLinkExamples.slice(0,3).join(', '),4,'links');
 const internalLinkTargets=[];
 for(const match of anchorTags){
  const href=attribute('<a '+match[1]+'>','href').trim();
  if(!href||href.startsWith('#'))continue;
  try{
   const resolved=new URL(href,url),base=new URL(url);
   if(['http:','https:'].includes(resolved.protocol)&&resolved.origin===base.origin){
    resolved.hash='';internalLinkTargets.push(resolved.href);
   }
  }catch{}
 }
 // Template placeholders in href attributes are source-level evidence, not a network failure.
 // Limit matching to explicit unresolved syntax to avoid treating ordinary URLs as broken.
 const templateLinks=[...new Set(anchorTags.map(match=>attribute('<a '+match[1]+'>','href').trim()).filter(href=>{
  // Decode at most once: encoded braces and dollar signs can hide a shipped placeholder.
  let candidate=href;
  try{candidate=decodeURIComponent(href)}catch{}
  return /\$\{[^}]+\}|\{\{[^}]+\}\}/.test(candidate);
 }))];
 if(templateLinks.length)add('unresolved_link_template','high',templateLinks.length+' distinct link destination(s) contain unresolved template placeholders. Replace placeholders with real URLs before publishing.',8,'links');
 const linksMissingName=linkIssues.filter(x=>x.code==='link_missing_name');
 const insecureLinks=linkIssues.filter(x=>x.code==='link_http');
 const javascriptLinks=linkIssues.filter(x=>x.code==='link_javascript');
 if(!isPartial){
  if(linksMissingName.length)add('links_missing_name','medium',linksMissingName.length+' link(s) lack discernible text, aria-label, title or image alt. Examples: '+linksMissingName.slice(0,3).map(x=>x.href).join(', ')+'.',Math.min(8,linksMissingName.length*2),'links');
  if(insecureLinks.length)add('links_http','low',insecureLinks.length+' link(s) use HTTP; confirm HTTPS alternatives exist. Examples: '+insecureLinks.slice(0,3).map(x=>x.href).join(', ')+'.',3,'links');
  if(javascriptLinks.length)add('links_javascript','medium',javascriptLinks.length+' link(s) use javascript: URLs rather than crawlable destinations.',4,'links');
 }else if(linkIssues.length)add('links_unverified','info','Partial HTML capture: link findings require complete-page verification.',0,'links');
 if(!structuredDataCount)add('no_structured_data','info','Consider relevant JSON-LD structured data where applicable.',0,'structured_data');

 const jsonLdScripts=[...html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi)];
 let invalidJsonLd=0,untypedJsonLd=0;
 const hasSchemaType=value=>Array.isArray(value)?value.some(hasSchemaType):Boolean(value&&typeof value==='object'&&(value['@type']||(Array.isArray(value['@graph'])&&value['@graph'].some(hasSchemaType))));
 for(const script of jsonLdScripts){
  try{if(!hasSchemaType(JSON.parse(script[1].trim())))untypedJsonLd++}
  catch{invalidJsonLd++}
 }
 if(invalidJsonLd)add('invalid_json_ld','medium',invalidJsonLd+' JSON-LD script(s) contain invalid JSON. Check syntax before relying on this structured data.',7,'structured_data');
 if(untypedJsonLd)add('json_ld_missing_type','low',untypedJsonLd+' valid JSON-LD script(s) have no detectable @type, including @graph nodes.',3,'structured_data');

 // Evidence is bounded, plain text; never render captured source as HTML.
 const safeSnippet=s=>String(s||'').replace(/\s+/g,' ').slice(0,240);
 const linkEvidence=linkIssues.reduce((groups,item)=>{
  const key=item.code==='link_missing_name'?'links_missing_name':item.code==='link_http'?'links_http':'links_javascript';
  (groups[key]??=[]).push({element:'a',attribute:'href',value:safeSnippet(item.href)});
  return groups;
 },{});
 const imageEvidence=missingAltTags.map((tag,index)=>({element:'img',index:index+1,attribute:'src',value:safeSnippet(attribute(tag,'src')||'(src missing)'),snippet:safeSnippet(tag)}));
 const jsonEvidence={invalid_json_ld:[],json_ld_missing_type:[]};
 for(const [index,script] of jsonLdScripts.entries()){
  const entry={element:'script[type="application/ld+json"]',index:index+1,snippet:safeSnippet(script[1])};
  try{if(!hasSchemaType(JSON.parse(script[1].trim())))jsonEvidence.json_ld_missing_type.push(entry)}
  catch{jsonEvidence.invalid_json_ld.push(entry)}
 }
 for(const finding of findings){
  const evidence=finding.code==='unresolved_link_template'?templateLinks.map(value=>({element:'a',attribute:'href',value:safeSnippet(value)})):(finding.code==='heading_hierarchy'?headingEvidence:finding.code==='images_missing_alt'?imageEvidence:(linkEvidence[finding.code]||jsonEvidence[finding.code]));
  if(evidence?.length)finding.evidence=evidence.slice(0,5);
 }

 // Incomplete captures can produce misleading absence-based findings; flag them for verification.
 if(isPartial){for(const finding of findings){finding.evidenceConfidence='provisional';finding.requiresRecapture=true;}}
 const deductions=findings.reduce((sum,f)=>sum+(f.points||0),0);
 const score=Math.max(0,100-deductions);
 // Category figures are deduction summaries, not independent 0–100 scores.
 const categoryDeductions={};
 for(const finding of findings){const key=finding.category||'technical';categoryDeductions[key]=(categoryDeductions[key]||0)+(finding.points||0)}
 const scoring={version:SEO_SCORING_VERSION,method:'weighted_html_finding_deductions',startingScore:100,totalDeductions:deductions,categoryDeductions,appliedScore:score,scoreFloor:0,coverage:isPartial?'partial_html_snapshot':'provided_html_only'};
 return {url,title,description,robots,canonical,lang,viewport,h1Count,ogTitle,ogDescription,ogImage,twitterCard,imageCount:imageTags.length,imagesMissingAlt,structuredDataCount,headingSkips,linkTypes,internalLinkTargets:[...new Set(internalLinkTargets)].slice(0,500),findings,scoring,scoringVersion:SEO_SCORING_VERSION,scope:'static_html_only',auditStatus:isPartial?'partial':'complete',partial:isPartial,incompleteReasons,score,maxScore:100,scoreLabel:isPartial?'Provisional score':'SEO HTML score',scoreExplanation:'Heuristic static HTML score based on weighted findings. Not Google ranking, performance, accessibility, or a full-site SEO score.'};
}
