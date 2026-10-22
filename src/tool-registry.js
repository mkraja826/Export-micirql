export const tools = [
  {
    "id": "screenshots",
    "name": "Screenshot Studio",
    "description": "Responsive full-page captures, page discovery and ZIP export.",
    "status": "available",
    "path": "/",
    "icon": "camera"
  },
  {
    "id": "seo",
    "name": "SEO Studio",
    "description": "Metadata, headings, canonical tags and HTML inspection.",
    "status": "limited",
    "path": "/tools/seo/",
    "icon": "search"
  },
  {
    "id": "qa",
    "name": "QA Testing Lab",
    "description": "Static HTML checks for headings, forms, images and anchors.",
    "status": "limited",
    "path": "/tools/qa/",
    "icon": "check-square"
  },
  {
    "id": "ui-ux",
    "name": "UI/UX Inspector",
    "description": "Typography, spacing, hierarchy, colors and usability.",
    "status": "planned",
    "path": null,
    "icon": "palette"
  },
  {
    "id": "performance",
    "name": "Performance Lab",
    "description": "Loading performance, assets and Core Web Vitals.",
    "status": "planned",
    "path": null,
    "icon": "gauge"
  },
  {
    "id": "accessibility",
    "name": "Accessibility Studio",
    "description": "Keyboard access, contrast and WCAG checks.",
    "status": "planned",
    "path": null,
    "icon": "accessibility"
  },
  {
    "id": "security",
    "name": "Security Inspector",
    "description": "HTTPS, headers and passive security checks.",
    "status": "planned",
    "path": null,
    "icon": "shield"
  },
  {
    "id": "responsive",
    "name": "Responsive Lab",
    "description": "Breakpoints, layout overflow and device comparisons.",
    "status": "planned",
    "path": null,
    "icon": "monitor"
  },
  {
    "id": "links",
    "name": "Link & Sitemap Inspector",
    "description": "Internal links, redirects, errors and sitemaps.",
    "status": "planned",
    "path": null,
    "icon": "link"
  },
  {
    "id": "design",
    "name": "Design System Extractor",
    "description": "Colors, fonts, spacing and reusable components.",
    "status": "planned",
    "path": null,
    "icon": "layers"
  },
  {
    "id": "compare",
    "name": "Visual Regression",
    "description": "Compare before-and-after website screenshots.",
    "status": "planned",
    "path": null,
    "icon": "columns"
  },
  {
    "id": "content",
    "name": "Content Inspector",
    "description": "Readability, content consistency and copy quality.",
    "status": "planned",
    "path": null,
    "icon": "file-text"
  },
  {
    "id": "developer",
    "name": "Developer Utilities",
    "description": "JSON-LD, metadata, robots and redirect helpers.",
    "status": "planned",
    "path": null,
    "icon": "code"
  },
  {
    "id": "builder",
    "name": "AI Website Builder",
    "description": "Generate, edit and publish via MiCirql Builder.",
    "status": "integration_planned",
    "path": null,
    "icon": "wand"
  },
  {
    "id": "agent",
    "name": "AI Web Agent",
    "description": "ChatGPT and Claude tools through authenticated MCP.",
    "status": "limited",
    "path": null,
    "icon": "bot"
  }
];
export function getCatalog(){return {service:'MiCirql Tools',version:2,tools};}
