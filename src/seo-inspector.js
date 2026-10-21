export function inspectSeoHtml(html,url) {
  const titleStart=html.toLowerCase().indexOf("<title>");
  const titleEnd=html.toLowerCase().indexOf("</title>",titleStart);
  const title=titleStart>=0&&titleEnd>titleStart?html.slice(titleStart+7,titleEnd).trim():"";
  const headings=html.match(/<h1\b/gi)||[];
  const findings=[];
  if(!title) findings.push({code:"missing_title",severity:"high"});
  if(headings.length!==1) findings.push({code:"heading_count",severity:"medium"});
  return {url,title,h1Count:headings.length,findings,scope:"static_html_only"};
}
