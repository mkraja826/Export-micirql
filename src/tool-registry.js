export const tools = [
  {id:"screenshot",name:"Screenshot Studio",status:"available",path:"/"},
  {id:"discovery",name:"Page Discovery",status:"available",path:"/"},
  {id:"seo",name:"SEO Inspector",status:"planned",path:null},
  {id:"audit",name:"Website Auditor",status:"planned",path:null},
  {id:"design",name:"Design System Extractor",status:"planned",path:null},
  {id:"compare",name:"Visual Comparison",status:"planned",path:null},
  {id:"builder",name:"AI Website Builder",status:"integration_planned",path:null}
];
export function getCatalog(){return {service:"MiCirql Tools",version:1,tools};}
