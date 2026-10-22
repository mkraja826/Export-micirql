import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const root=resolve('extension');
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
if(manifest.manifest_version!==3)throw Error('Expected Manifest V3');
if(!/^\\d+\\.\\d+\\.\\d+$/.test(manifest.version))throw Error('Invalid extension version');
const required=[
 'manifest.json',
 manifest.background?.service_worker,
 manifest.action?.default_popup,
 ...(manifest.content_scripts||[]).flatMap(item=>item.js||[]),
 'popup.js','offscreen.html','zip.js'
];
for(const name of required){
 if(typeof name!=='string'||name.startsWith('/')||name.includes('..'))throw Error('Unsafe or missing manifest file reference');
 if(!existsSync(resolve(root,name)))throw Error('Missing extension file: '+name);
}
for(const [name,links] of [['offscreen.html',['zip.js']],['popup.html',['popup.js']]]){
 const html=readFileSync(resolve(root,name),'utf8');
 for(const link of links)if(!html.includes(link))throw Error(name+' does not load '+link);
}
const expected=['https://tools.micirql.com/*','https://export.micirql.com/*'];
const matches=(manifest.content_scripts||[]).flatMap(entry=>entry.matches||[]);
for(const target of expected)if(!matches.includes(target))throw Error('Missing first-party bridge: '+target);
console.log('Extension assets, version and first-party content script patterns validated:',manifest.version);
