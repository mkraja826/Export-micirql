// MiCirql QA Lab: bounded static HTML evidence, not executable journey testing.
export const QA_INSPECTOR_VERSION='micirql-qa-v1';
const attr=(tag,name)=>{
 const match=String(tag).match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i'));
 return match?match[1]??match[2]??match[3]:'';
};
const strip=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const tagName=s=>String(s).match(/^<([a-z][\w:-]*)/i)?.[1]?.toLowerCase()||'';
export function inspectQaHtml(html,url,options={}){
 if(typeof html!=='string'||html.length>1000000)throw Error('HTML must be a string under 1 MB');
 const page=new URL(url);
 if(!['http:','https:'].includes(page.protocol)||page.username||page.password)throw Error('Invalid website URL');
 // Ignore inactive markup, comments and source-code examples.
 const cleaned=html.replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(?:template|noscript|xmp)\b[^>]*>[\s\S]*?<\/(?:template|noscript|xmp)\s*>/gi,' ')
  .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/gi,' ')
  .replace(/(<textarea\b[^>]*>)[\s\S]*?<\/textarea\s*>/gi,'$1</textarea>');
 const partial=options.partial===true;
 const findings=[];
 const add=(code,severity,message,evidence='')=>findings.push({code,severity,message,...(evidence?{evidence:String(evidence).slice(0,180)}:{})});
 const headings=[...cleaned.matchAll(/<h([1-6])\b[^>]*>/gi)].map(match=>Number(match[1]));
 if(!partial&&!headings.includes(1))add('missing_h1','low','No H1 heading found. Review the visible page heading.');
 let headingJumps=0;
 if(!partial)for(let i=1;i<headings.length;i++)if(headings[i]>headings[i-1]+1)headingJumps++;
 if(headingJumps)add('heading_jump','low',headingJumps+' heading transition(s) skip levels. Review reading order.');
 const ids=new Set([...cleaned.matchAll(/<[a-z][^>]*\bid\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi)].map(match=>match[1]||match[2]));
 const labelMatches=[...cleaned.matchAll(/<label\b[^>]*>[\s\S]*?<\/label\s*>/gi)];

 // Identify duplicate IDs, which can break labels and in-page navigation.
 const idValues=[...cleaned.matchAll(/<[a-z][^>]*\bid\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi)].map(match=>match[1]||match[2]);
 const repeated=[...new Set(idValues.filter((id,index)=>idValues.indexOf(id)!==index))];
 for(const id of repeated.slice(0,20))add('duplicate_id','medium','Multiple elements share the same ID, which can confuse navigation and assistive technology.',id);
 // Detect basic link naming and target problems without attempting to follow links.
 for(const match of cleaned.matchAll(/<a\b[^>]*>/gi)){
  const tag=match[0],target=attr(tag,'target').toLowerCase(),rel=attr(tag,'rel').toLowerCase();
  if(target==='_blank'&&!/\bnoopener\b/.test(rel))add('new_tab_without_noopener','info','A new-tab link does not explicitly include noopener. Modern browsers generally protect these links.','a');
 }
 const labels=new Set(labelMatches.map(match=>attr(match[0].split('>')[0]+'>','for')).filter(Boolean));
 const wrappedControlPositions=labelMatches.map(match=>({from:match.index,to:match.index+match[0].length}));
 const controls=[...cleaned.matchAll(/<(input|select|textarea)\b[^>]*>/gi)];
 for(const match of controls){
  const tag=match[0],type=attr(tag,'type').toLowerCase();
  if(['hidden','submit','button','reset','image'].includes(type))continue;
  const id=attr(tag,'id');
  const wrapped=wrappedControlPositions.some(range=>match.index>=range.from&&match.index<range.to);
  if(!attr(tag,'aria-label')&&!attr(tag,'aria-labelledby')&&!(id&&labels.has(id))&&!wrapped)
   add('unlabelled_control','medium','Form field lacks a detectable accessible label.',tagName(tag));
 }
 const buttons=[...cleaned.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi)];
 for(const match of buttons){
  const opening=match[0].split('>')[0]+'>',inside=match[2];
  const named=strip(inside)||attr(opening,'aria-label')||attr(opening,'aria-labelledby')||attr(opening,'title')||[...inside.matchAll(/<img\b[^>]*>/gi)].some(item=>attr(item[0],'alt'));
  if(!named)add('empty_button','medium','Button has no detectable accessible name.','button');
 }
 const images=[...cleaned.matchAll(/<img\b[^>]*>/gi)];
 for(const match of images){
  const tag=match[0];if(/\salt\s*=/i.test(tag))continue;
  if(/^(?:presentation|none)$/i.test(attr(tag,'role'))||attr(tag,'aria-hidden').toLowerCase()==='true')continue;
  if(Number(attr(tag,'width'))===1&&Number(attr(tag,'height'))===1)continue;
  add('missing_image_alt','medium','Informative image may lack an alt attribute.',attr(tag,'src')||'image');
 }
 const links=[...cleaned.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)];
 for(const match of links){
  const opening='<a '+match[1]+'>',href=attr(opening,'href').trim(),inside=match[2];
  if(!href||href==='#')add('empty_link_target','low','Link has an empty or placeholder destination.');
  else if(!partial&&href.startsWith('#')){
   let fragment=href.slice(1);try{fragment=decodeURIComponent(fragment)}catch{}
   if(fragment&&!ids.has(fragment))add('missing_anchor','low','In-page anchor target not found in captured HTML: '+href,href);
  }
  const named=strip(inside)||attr(opening,'aria-label')||attr(opening,'aria-labelledby')||attr(opening,'title')||[...inside.matchAll(/<img\b[^>]*>/gi)].some(item=>attr(item[0],'alt'));
  if(!named)add('unnamed_link','medium','Link has no detectable accessible name.',href||'link');
 }
 if(partial)for(const finding of findings){finding.evidenceConfidence='provisional';finding.requiresRecapture=true;}
 return {url:page.href,scope:'static_html_only',inspectorVersion:QA_INSPECTOR_VERSION,auditStatus:partial?'partial':'complete',partial,
  counts:{headings:headings.length,images:images.length,links:links.length,formControls:controls.length,buttons:buttons.length},
  findings};
}