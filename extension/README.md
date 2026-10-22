# MiCirql Export Chrome extension (prototype)

Load unpacked from chrome://extensions (Developer mode) by selecting this extension directory. Enter a public URL and select 375px Mobile, 768px Tablet or 1440px Desktop. Images download directly to the local Downloads folder.

Uses Chrome DevTools Protocol through the debugger permission to emulate viewport sizes and capture full-page images locally. Chrome displays a debugging warning while capture runs. No screenshot pixels are uploaded to MiCirql servers.

Current MVP captures the entered URL and one optional same-origin subpage, each at selected viewport widths. ZIP, automatic subpage discovery, cross-browser support, persistent progress and store publication are future milestones. Captures may fail on protected websites or unusually long pages.

Security: only http(s) URLs accepted. Chrome's own permissions and networking govern access; this extension is not an SSRF proxy. Do not enter private/intranet URLs unless you intend to capture them locally.

Test on a dedicated Chrome profile before publishing. Chrome Web Store distribution may require a developer registration fee; unpacked installation is free.

## Download the extension ZIP from GitHub Actions

After the **Verify MiCirql Tools** workflow succeeds on `main`, open the successful run in GitHub **Actions**, then download the artifact called **micirql-tools-extension**. This artifact is a ZIP containing the extension's root-level `manifest.json` and the required scripts. Extract the ZIP to a permanent folder; Chrome cannot load a ZIP directly as an unpacked extension.

In Chrome, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder containing `manifest.json`. If an older unpacked copy is already installed, remove or reload it before testing. The installer is **not** a Chrome Web Store package.

The workflow runs tests and asset validation before building and uploading this artifact. An artifact being configured in CI does not mean that a successful CI run or Chrome browser test has been verified.
