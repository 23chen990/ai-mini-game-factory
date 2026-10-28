import { expect, it } from 'vitest';
import { buildPermissionManifest, assertPermissionOperation } from '../../src/core/permission-manifest.js';
it('lets independent QA read verified reference pixels and the shipped candidate, but not source or quarantined evidence',()=>{
 const manifest=buildPermissionManifest('QA');
 for(const path of ['workspace/game/dist/index.html','reference-evidence/derived/source/frame.png','reference-evidence/verified/source.mp4','reference-evidence/manifest.json','screenshots/reference-level/mobile.png','logs/reference-level/mobile-events.json']) expect(()=>assertPermissionOperation(manifest,{kind:'read',path})).not.toThrow();
 for(const path of ['workspace/game/src/main.ts','reference-evidence/excluded/unrelated.mp4','reference-evidence/incoming/pending.mp4']) expect(()=>assertPermissionOperation(manifest,{kind:'read',path})).toThrow();
 expect(()=>assertPermissionOperation(manifest,{kind:'write',path:'workspace/game/dist/index.html'})).toThrow();
});
