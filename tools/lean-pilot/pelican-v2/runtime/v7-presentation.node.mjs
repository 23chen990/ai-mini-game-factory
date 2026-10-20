import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
const ui=await readFile(new URL('./coast-ui.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('./coast.css',import.meta.url),'utf8');
test('starting a ride precedes the optional route list and collapsed wardrobe',()=>{
 assert.match(ui,/<details id="co-wardrobe"><summary>/);
 assert.ok(ui.indexOf('id="co-start"')<ui.indexOf('id="co-route"'));
 assert.match(ui,/\$\('wardrobe'\)\.hidden=p!=='ready'/);
});
test('wing feedback uses the existing compact low-screen treatment, including narrow phones',()=>{
 const groups=css.match(/[^{}]+(?=\{)/g);
 assert.ok(groups.filter(s=>s.includes('#co-feedback.glide')&&s.includes('#co-feedback.catch')).length>=3);
 assert.ok(groups.filter(s=>s.includes('#co-feedback.air-catch')&&s.includes('#co-feedback.catch')).length>=3);
});
test('expanded wardrobe cannot shrink to a summary-only viewport',()=>{
 assert.match(css,/#co-wardrobe\[open\]\{[^}]*flex-shrink:0!important/);
 assert.match(css,/\.co-card:has\(#co-wardrobe\[open\]\)\{overflow:auto/);
});
