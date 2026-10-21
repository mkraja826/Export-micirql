# MiCirql Export — Chrome release verification

## Install
1. Download the repository and extract it.
2. In desktop Google Chrome, visit chrome://extensions.
3. Enable Developer mode, choose Load unpacked and select the `extension` directory.
4. Open https://export.micirql.com and refresh once after installing.
5. Confirm the website recognizes the extension.

## Manual capture matrix
Use a public site you control for testing. For each format (JPG, PNG):
- Home at 375, 768 and 1440px.
- About or Services subpage at 375, 768 and 1440px.
- Confirm exactly six distinct downloads and correct page labels.
- Check the actual image pixel width, full-page height, fonts, lazy-loaded images, sticky headers and consent banners.
- Repeat with a slow website, a redirect, and a page taller than 16,000px.
- Test cancelling a download, switching tabs, closing the popup, and retrying after failure.
- Confirm overlapping capture requests are rejected clearly.

## Privacy and limitations
- The extension renders pages using the user's Chrome installation.
- Images are downloaded locally and are not uploaded to MiCirql servers.
- Browser debugging permissions are powerful; review permissions before Chrome Web Store submission.
- Local capture is not supported by the same extension workflow on most mobile browsers.
- Website preview and single ZIP packaging are not enabled in the current local-download workflow.
- The legacy cloud screenshot endpoints remain in the code and must not be represented as removed.
- Captures of third-party pages may be blocked or visually incomplete due to browser and site restrictions.

## Release gate
Do not claim production-ready until the six-capture matrix passes, large screenshot memory use is measured, the extension-to-website handshake is verified, and the deployment is smoke-tested.
