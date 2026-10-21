# MiCirql Export Chrome extension (prototype)

Load unpacked from chrome://extensions (Developer mode) by selecting this extension directory. Enter a public URL and select 375px Mobile, 768px Tablet or 1440px Desktop. Images download directly to the local Downloads folder.

Uses Chrome DevTools Protocol through the debugger permission to emulate viewport sizes and capture full-page images locally. Chrome displays a debugging warning while capture runs. No screenshot pixels are uploaded to MiCirql servers.

Current MVP captures **one URL at a time**. Home plus one subpage, ZIP, cross-browser support, persistent progress and store publication are future milestones. Captures may fail on protected websites or unusually long pages.

Security: only http(s) URLs accepted. Chrome's own permissions and networking govern access; this extension is not an SSRF proxy. Do not enter private/intranet URLs unless you intend to capture them locally.

Test on a dedicated Chrome profile before publishing. Chrome Web Store distribution may require a developer registration fee; unpacked installation is free.
