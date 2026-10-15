import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesBrowserIdentity } from '../qa-report-identity.mjs';

const natural = engine => ({runtime: engine+' desktop touch emulation; not physical mobile',normalInputOnly:true,stateInjection:false});

test('original immutable QA reports identify both browsers through their recorded runtime', () => {
 for(const engine of ['webkit','chromium'])assert.equal(matchesBrowserIdentity(natural(engine),engine),true);
});
test('browser identity rejects missing, cross-engine and contradictory provenance', () => {
 assert.equal(matchesBrowserIdentity(natural('chromium'),'webkit'),false);
 assert.equal(matchesBrowserIdentity({...natural('webkit'),engine:'chromium'},'webkit'),false);
 assert.equal(matchesBrowserIdentity({...natural('webkit'),runtime:undefined},'webkit'),false);
 assert.equal(matchesBrowserIdentity(natural('firefox'),'firefox'),false);
});
test('browser identity rejects injected or unrecorded input and accepts consistent explicit engine', () => {
 assert.equal(matchesBrowserIdentity({...natural('webkit'),stateInjection:true},'webkit'),false);
 assert.equal(matchesBrowserIdentity({...natural('webkit'),normalInputOnly:undefined},'webkit'),false);
 assert.equal(matchesBrowserIdentity({...natural('webkit'),engine:'webkit'},'webkit'),true);
});
