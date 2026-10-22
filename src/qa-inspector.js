// Static HTML QA checks: no remote fetching or script execution.
const attr=(tag,name)=>{const escaped=name.replace(/[.*+?^$()|[\]{}]/g,'\\$&');const m=tag.match(new RegExp('(?:^|\\s)'+escaped+'\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))','i'));return m?m[1]??m[2]??m[3]:''};
const strip=s=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').trim();
export function inspectQaHtml(html,url){
 if(typeof html!=='string'||html.length>1000000)throw Error('HTML must be a string under 1 MB');
 const page=new URL(url);if(!['http:','https:'].includes(page.protocol))throw Error('Invalid website URL');
 const findings=[];const add=(code,severity,message)=>findings.push({code,severity,message});
 const headings=[...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map(x=>Number(x[1]));
 if(!headings.includes(1))add('missing_h1','medium','No H1 heading found');
 for(let i=1;i<headings.length;i++)if(headings[i]>headings[i-1]+1)add('heading_jump','low','Heading hierarchy skips a level');
 const ids=new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(x=>x[1]));
 const labels=new Set([...html.matchAll(/<label\b[^>]*>/gi)].map(x=>attr(x[0],'for')).filter(Boolean));
 const controls=[...html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)];
 for(const item of controls){const tag=item[0],type=attr(tag,'type').toLowerCase();if(['hidden','submit','button','reset','image'].includes(type))continue;const id=attr(tag,'id');if(!attr(tag,'aria-label')&&!attr(tag,'aria-labelledby')&&!(id&&labels.has(id)))add('unlabelled_control','medium','Form control may lack an accessible label');}
 const buttons=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];for(const item of buttons)if(!strip(item[2])&&!attr(item[0].split('>')[0]+'>','aria-label')&&!/\btitle\s*=/.test(item[1]))add('empty_button','medium','Button has no discernible text');
 const images=[...html.matchAll(/<img\b[^>]*>/gi)];for(const item of images)if(!/\balt\s*=/.test(item[0]))add('missing_image_alt','medium','Image is missing alt attribute');
 const links=[...html.matchAll(/<a\b[^>]*>/gi)];for(const item of links){const href=attr(item[0],'href');if(!href||href==='#')add('empty_link_target','low','Link has an empty or placeholder destination');else if(href.startsWith('#')&&!ids.has(href.slice(1)))add('missing_anchor','low','Internal anchor target not found: '+href)}
 return {url:page.href,scope:'static_html_only',counts:{headings:headings.length,images:images.length,links:links.length,formControls:controls.length,buttons:buttons.length},findings};
}
