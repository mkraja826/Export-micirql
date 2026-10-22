// Conservative source-level UI/UX signals, not a visual rendering audit.
export function inspectUiHtml(html,url){
 if(typeof html!=='string'||html.length>1000000)throw Error('HTML must be a string under 1 MB');
 const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw Error('Invalid URL');
 const findings=[];const add=(code,severity,message)=>findings.push({code,severity,message});
 const head=(html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)||[])[1]||html.slice(0,100000);
 const viewport=/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(head)||/<meta\b[^>]*content\s*=\s*["'][^"']*width=device-width[^"']*["'][^>]*>/i.test(head);
 if(!viewport)add('missing_viewport','high','Mobile viewport metadata is missing');
 if(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[\s,"']|$)/i.test(head))add('zoom_restricted','medium','Viewport settings may restrict user zoom');
 const styleBlocks=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
 const css=styleBlocks+'\n'+[...html.matchAll(/\bstyle\s*=\s*["']([^"']*)["']/gi)].map(m=>m[1]).join('\n');
 if(/overflow-x\s*:\s*hidden/i.test(css))add('hidden_horizontal_overflow','low','Horizontal overflow is hidden; verify content is not clipped');
 if(/(?:font-size\s*:\s*(?:[0-9]|1[0-1])px)/i.test(css))add('small_text','medium','Some declared text sizes may be too small');
 const mediaQueries=[...styleBlocks.matchAll(/@media\b/gi)].length;
 if(styleBlocks.trim()&&!mediaQueries)add('no_inline_responsive_rules','info','No responsive media rules found in inline styles; external stylesheets are not inspected');
 const nav=/<nav\b/i.test(html),main=/<main\b/i.test(html),footer=/<footer\b/i.test(html);
 if(!main)add('missing_main','medium','No main landmark found');
 if(!nav)add('missing_nav','low','No navigation landmark found');
 const buttons=[...html.matchAll(/<button\b[^>]*>/gi)].length;
 const images=[...html.matchAll(/<img\b[^>]*>/gi)].length;
 return {url:parsed.href,scope:'static_html_ui_signals_only',counts:{images,buttons,mediaQueries},landmarks:{nav,main,footer},findings};
}
