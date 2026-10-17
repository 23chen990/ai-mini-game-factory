import test from 'node:test';
import assert from 'node:assert/strict';
import * as session from '../racing/session.mjs';
class Material {onBeforeCompile() {} dispose(){this.disposed=(this.disposed??0)+1;}}
class Standard extends Material {constructor(){super();this.isMeshStandardMaterial=true;this.color={v:1};this.emissive={v:2};this.map={texture:true};this.emissiveIntensity=3;this.opacity=.9;this.transparent=true;this.side=2;}}
class Lambert extends Material {constructor(options){super();Object.assign(this,options);this.isMeshLambertMaterial=true;}}
const THREE={Material,MeshLambertMaterial:Lambert};
const root=objects=>({traverse(fn){objects.forEach(fn);}});
function fixture(){
 const original=new Standard(),object={isMesh:true,material:original,position:{x:1,y:2,z:3}},objects=[object];
 const game={scene:root(objects),settings:{quality:'low'},racers:[],setupQuality(){this.setupCalls=(this.setupCalls??0)+1;},makeRacers(){return 7;},async loadMap(){return 'loaded';},disposeLevel(){this.level=null;}};
 return {game,original,object,objects};
}
test('low tier keeps geometry, colour, textures, alpha and live light colours without PBR reflection cost',()=>{
 const {game,original,object}=fixture(),position=object.position;
 assert.equal(session.installRaceLowMaterialBudget(game,THREE),true);
 const m=object.material;
 assert.equal(m.isMeshLambertMaterial,true);assert.equal(m.map,original.map);
 assert.equal(m.color,original.color);assert.equal(m.emissive,original.emissive);
 for(const k of ['opacity','transparent','side','emissiveIntensity'])assert.equal(m[k],original[k]);
 assert.equal(object.position,position);
 original.emissive.v=9;assert.equal(m.emissive.v,9);
});
test('explicit mid/high restores exact original material identity; derived resources are disposed once',()=>{
 const {game,original,object}=fixture();session.installRaceLowMaterialBudget(game,THREE);
 const low=object.material;game.settings.quality='high';game.setupQuality();
 assert.equal(object.material,original);assert.equal(low.disposed,1);assert.equal(original.disposed,undefined);
 game.setupQuality();assert.equal(low.disposed,1);assert.equal(game.setupCalls,2);
});
test('shared materials are cached, arrays and newly made racers work, installation is idempotent',()=>{
 const {game,original,object,objects}=fixture();objects.push({isMesh:true,material:[original,original]});
 session.installRaceLowMaterialBudget(game,THREE);const low=object.material;
 assert.equal(objects[1].material[0],low);assert.equal(objects[1].material[1],low);
 assert.equal(session.installRaceLowMaterialBudget(game,THREE),false);
 assert.equal(game.makeRacers(),7);assert.equal(object.material,low);
});
test('custom vertex shaders and non-PBR materials are never silently replaced',()=>{
 const {game,objects}=fixture();const custom=new Standard();custom.onBeforeCompile=()=>{};
 const basic=new Material();objects.push({isMesh:true,material:custom},{isSprite:true,material:basic});
 session.installRaceLowMaterialBudget(game,THREE);assert.equal(objects[1].material,custom);assert.equal(objects[2].material,basic);
});
test('removed nodes release only owned lightweight resources; async map return is preserved',async()=>{
 const {game,original,object,objects}=fixture();session.installRaceLowMaterialBudget(game,THREE);
 const low=object.material;objects.splice(0,1);assert.equal(await game.loadMap(),'loaded');
 assert.equal(low.disposed,1);assert.equal(original.disposed,undefined);
 assert.equal(game.__RACE_MATERIAL_BUDGET__.stats().cached,0);
});
test('no renderer or THREE namespace is a harmless no-op; no clock, save or physics writes',()=>{
 assert.equal(session.installRaceLowMaterialBudget({},null),false);
 const {game}=fixture();game.cdT=1;game.raceTime=2;game.player={progress:3,s:4};
 const before=JSON.stringify([game.cdT,game.raceTime,game.player,game.settings]);
 session.installRaceLowMaterialBudget(game,THREE);game.makeRacers();
 assert.equal(JSON.stringify([game.cdT,game.raceTime,game.player,game.settings]),before);
});
