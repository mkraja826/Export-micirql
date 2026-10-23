// MiCirql SEO signals: deterministic source/DOM-based checks; not a search ranking prediction.
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
 const canonicalTag=links.find(t=>attribute(t,'rel').toLowerCase().split(/\s+/).includes('canonical'));
 const canonical=canonicalTag?attribute(canonicalTag,'href'):'';
 const htmlTag=(html.match(/<html\b[^>]*>/i)||[])[0]||'';
 const lang=attribute(htmlTag,'lang'),h1Count=[...html.matchAll(/<h1(?:\s|>)/gi)].length;
 const ogTitle=findMeta('property','og:title'),ogDescription=findMeta('property','og:description'),ogImage=findMeta('property','og:image');
 const twitterCard=findMeta('name','twitter:card');
 const imageTags=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
 const imagesMissingAlt=imageTags.filter(t=>!/\salt\s*=/i.test(t)).length;
 const structuredDataCount=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/gi)].length;
 const headingLevels=[...html.matchAll(/<h([1-6])(?:\s|>)/gi)].map(m=>Number(m[1]));
 let headingSkips=0;for(let i=1;i<headingLevels.length;i++)if(headingLevels[i]>headingLevels[i-1]+1)headingSkips++;
 const findings=[];
 const add=(code,severity,message,points=0,category='technical')=>findings.push({code,severity,message,points,category});
 const errorPage=/\b(?:cloudflare|connection timed out)\b/i.test(title)&&/\b(?:5(?:0[0-9]|2[0-9])|4(?:0[34]|2[9]))\b/.test(title)||/<title[^>]*>[^<]*(?:403 forbidden|404 not found|502 bad gateway|503 service unavailable|504 gateway timeout|522 connection timed out)[^<]*<\/title>/i.test(head)||/cf-error-code|cf-error-details|cloudflare-error-500s/i.test(html.slice(0,120000));
 const isPartial=options.partial===true;
 if(errorPage){
  return {url,title,description,robots,canonical,lang,viewport,h1Count,findings:[{code:'error_page',severity:'high',message:'The captured page appears to be an HTTP or Cloudflare error page. Audit the actual website instead.',points:0,category:'availability'}],scope:'static_html_only',auditStatus:'invalid_error_page',score:null,maxScore:100,scoreLabel:'Not scored',partial:isPartial,scoreExplanation:'Error pages cannot receive a meaningful SEO score.'};
 }
 if(!title)add('missing_title','high','Add a descriptive page title.',20,'metadata');
 else if(title.length<15||title.length>65)add('title_length','low','Review title length (rough guideline: 15–65 characters).',5,'metadata');
 if(!description)add('missing_description','medium','Add a unique meta description.',12,'metadata');
 else if(description.length<70||description.length>170)add('description_length','low','Review description length (rough guideline: 70–170 characters).',4,'metadata');
 if(h1Count!==1)add('heading_count','medium','Use one clear H1 heading.',10,'content');
 if(headingSkips)add('heading_hierarchy','low','Heading levels skip steps in '+headingSkips+' place(s).',4,'content');
 if(!canonical)add('missing_canonical','medium','Declare a canonical URL.',8,'indexability');
 else{try{if(!['http:','https:'].includes(new URL(canonical,url).protocol))add('canonical_invalid','medium','Canonical URL is invalid.',7,'indexability')}catch{add('canonical_invalid','medium','Canonical URL is invalid.',7,'indexability')}}
 if(!lang)add('missing_language','medium','Add the document language attribute.',5,'technical');
 if(!viewport)add('missing_viewport','medium','Add a mobile viewport meta tag.',8,'technical');
 if(/\bnoindex\b/i.test(robots))add('noindex','high','This page requests noindex; confirm it should be excluded from search.',25,'indexability');
 if(!ogTitle)add('missing_og_title','low','Add Open Graph title for social sharing.',3,'social');
 if(!ogDescription)add('missing_og_description','low','Add Open Graph description.',3,'social');
 if(!ogImage)add('missing_og_image','low','Add Open Graph image.',3,'social');
 if(!twitterCard)add('missing_twitter_card','info','Consider adding a Twitter/X card tag.',0,'social');
 if(imagesMissingAlt)add('images_missing_alt','medium',imagesMissingAlt+' image(s) lack an alt attribute.',Math.min(10,imagesMissingAlt*2),'content');
 if(!structuredDataCount)add('no_structured_data','info','Consider relevant JSON-LD structured data where applicable.',0,'structured_data');
 const deductions=findings.reduce((sum,f)=>sum+(f.points||0),0);
 const score=Math.max(0,100-deductions);
 return {url,title,description,robots,canonical,lang,viewport,h1Count,ogTitle,ogDescription,ogImage,twitterCard,imageCount:imageTags.length,imagesMissingAlt,structuredDataCount,headingSkips,findings,scope:'static_html_only',auditStatus:isPartial?'partial':'complete',partial:isPartial,score,maxScore:100,scoreLabel:isPartial?'Provisional score':'SEO HTML score',scoreExplanation:'Heuristic static HTML score based on weighted findings. Not Google ranking, performance, accessibility, or a full-site SEO score.'};
}
