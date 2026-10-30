import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRedirectEvidence} from '../public/tools/seo/redirect-evidence.js';

test('two observed redirects produce advisory chain evidence',()=>{
 const actual=analyzeRedirectEvidence({redirects:[{url:'https://example.org/a',status:301,location:'/b'},{url:'https://example.org/b',status:302,location:'/c'}]});
 assert.equal(actual[0]?.code,'redirect_chain_observed');
 assert.equal(actual[0]?.points,0);
 assert.equal(actual[0]?.evidence.length,2);
});
test('revisited source in observed hops is flagged as possible redirect loop',()=>{
 const actual=analyzeRedirectEvidence({redirects:[{url:'https://example.org/a',status:301,location:'/b'},{url:'https://example.org/b',status:302,location:'/a'},{url:'https://example.org/a',status:301,location:'/b'}]});
 assert.equal(actual[0]?.code,'redirect_loop_observed');
 assert.equal(actual[0]?.points,0);
});
test('no observed redirect response means no inference',()=>{
 assert.deepEqual(analyzeRedirectEvidence({finalUrl:'https://example.org/final',requestedUrl:'https://example.org/start'}),[]);
 assert.deepEqual(analyzeRedirectEvidence(null),[]);
});
