import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const extension=readFileSync(new URL('extension/background.js',root),'utf8');
const bridge=readFileSync(new URL('extension/bridge.js',root),'utf8');
const studio=readFileSync(new URL('public/tools/seo/index.html',root),'utf8');
test('robots capture stays on audited origin and does not follow redirects automatically',()=>{
 assert.match(extension,/new URL\('\/robots\.txt',website\.origin\)/);
 assert.match(extension,/credentials:'omit',redirect:'manual'/);
 assert.match(extension,/READ_SEO_ROBOTS/);
 assert.match(extension,/total>500000/);
});
test('robots extension bridge preserves read-only response channel',()=>{
 assert.match(bridge,/MICIRQL_SEO_ROBOTS/);
 assert.match(bridge,/READ_SEO_ROBOTS/);
 assert.match(bridge,/MICIRQL_SEO_ROBOTS_RESULT/);
});
test('site audit requests robots once and preserves unknown evidence',()=>{
 const matches=studio.match(/extensionRequest\('MICIRQL_SEO_ROBOTS'/g)||[];
 assert.equal(matches.length,1);
 assert.match(studio,/siteReport\.robotsTxtEvidence=robotsResponse\.ok/);
 assert.match(studio,/observed:false,status:null,reason:'extension_unverified'/);
});
