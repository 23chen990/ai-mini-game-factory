import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateScope, BASE_COMMIT} from '../scope-check.mjs';
const pkg = {name:'factory', scripts:{test:'node --test'}};
test('register only the read-only racing cold-start workflow',()=>{
  assert.equal(evaluateScope(['.github/workflows/racing-cold-start-qa.yml'],pkg,pkg).passed,true);
});
test('workflow registration never broadens unrelated paths or permits traversal',()=>{
  for(const name of ['.github/workflows/other.yml','.github/workflows/racing-cold-start-qa.yml.bak','other-game/game.js','tools/lean-pilot/../escape.mjs','tools/lean-pilot/node_modules/escape.mjs']){
    assert.equal(evaluateScope([name],pkg,pkg).passed,false,name);
  }
});
test('frozen scope base and package protections remain intact',()=>{
  assert.equal(BASE_COMMIT,'f38d9955575db5561eba40007640c00094add885');
  assert.ok(evaluateScope([],pkg,{...pkg,name:'changed'}).blockers.includes('package:non-script-fields-changed'));
  assert.ok(evaluateScope([],pkg,{...pkg,scripts:{test:'echo pass'}}).blockers.includes('package:legacy-script:test'));
});
