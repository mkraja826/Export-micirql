// Static HTML SEO analysis. No network access or browser execution.
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
function attribute(tag,name){
 const re=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i');
 const m=tag.match(re);
 return m?decode(m[1]??m[2]??m[3]):'';
}
export function inspectSeoHtml(html,url){
 if(typeof html!=='string'||html.length>1000000)throw new Error('HTML must be a string under 1 MB');
 const head=(html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)||[])[1]||html.slice(0,100000);
 const title=decode((head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)||[])[1]||'');
 const meta=[...head.matchAll(/<meta\b[^>]*>/gi)].map(x=>x[0]);
 const links=[...head.matchAll(/<link\b[^>]*>/gi)].map(x=>x[0]);
 const findMeta=(key,value)=>{const tag=meta.find(t=>attribute(t,key).toLowerCase()===value);return tag?attribute(tag,'content'):''};
 const description=findMeta('name','description');
 const robots=findMeta('name','robots');
 const viewport=findMeta('name','viewport');
 const canonicalTag=links.find(t=>attribute(t,'rel').toLowerCase().split(/\s+/).includes('canonical'));
 const canonical=canonicalTag?attribute(canonicalTag,'href'):'';
 const htmlTag=(html.match(/<html\b[^>]*>/i)||[])[0]||'';
 const lang=attribute(htmlTag,'lang');
 const h1Count=[...html.matchAll(/<h1(?:\s|>)/gi)].length;
 const findings=[];
 const add=(code,severity,message)=>findings.push({code,severity,message});
 if(!title)add('missing_title','high','Missing page title');
 if(!description)add('missing_description','medium','Missing meta description');
 if(h1Count!==1)add('heading_count','medium','Review H1 heading count');
 if(!canonical)add('missing_canonical','low','No canonical URL declared');
 if(!lang)add('missing_language','medium','Missing HTML language');
 if(!viewport)add('missing_viewport','medium','Missing viewport metadata');
 if(robots.toLowerCase().includes('noindex'))add('noindex','info','Page requests noindex');
 return {url,title,description,robots,canonical,lang,viewport,h1Count,findings,scope:'static_html_only'};
}
