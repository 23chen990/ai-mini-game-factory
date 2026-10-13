import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {URL} from 'node:url';

test('actual race adapter credits the player, independently of the AI leader', async () => {
  const source=await readFile(new URL('../main.mjs',import.meta.url),'utf8');
  const expression=source.match(/score: \(\) => (g\.state[^\n]+?), clearInput:/)?.[1];
  assert.ok(expression,'Source-facing accessor must remain inspectable');
  const score=g=>new Script('('+expression+')').runInNewContext({g});
  assert.equal(score({state:'finish',player:{finished:false},racers:[{finished:true}]}),0,'AI cannot award player credit');
  assert.equal(score({state:'finish',player:{finished:true},racers:[{finished:false}]}),1,'Player completion is independent of leader');
  assert.equal(score({state:'race',player:{finished:false},racers:[{finished:true}]}),0);
});

test('race settlement pauses the native finish loop and preserves the player outcome', async () => {
  const source=await readFile(new URL('../main.mjs',import.meta.url),'utf8');
  const race=source.slice(source.indexOf("if (id === 'qq-speed'"));
  const body=race.match(/pause: \(\) => \{ (.+?) \}, resume:/)?.[1];
  assert.ok(body,'The source-facing pause callback must remain inspectable');
  for(const state of ['race','countdown','finish']) {
    const g={state,player:{finished:false},togglePause(){this.state='paused';}};
    new Script(body).runInNewContext({g});
    assert.equal(g.state,'paused',state+' must stop the native simulation');
    // The native loop advances racers unless paused, including after its own results.
    if(g.state!=='paused')g.player.finished=true;
    assert.equal(g.player.finished,false,'A DNF cannot become completion after settlement');
  }
});
