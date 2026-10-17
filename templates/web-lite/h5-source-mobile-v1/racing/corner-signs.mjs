/**
 * Cheap corner approach markers for mobile. Static non-colliding sprites are
 * attached to the existing level; no new road mesh, physics or art files.
 */
export function chooseCornerSigns(track, maxCount = 7) {
  if (!track?.curv || !Number.isFinite(track.length) || !Number.isFinite(track.ds) ||
      track.length <= 400 || track.ds <= 0 || !Number.isInteger(track.N)) return [];
  const corners=[];
  // Sample spaced candidates rather than creating hundreds of geometry objects.
  for (let i=0;i<track.N;i+=8) {
    const d=i*track.ds, curve=track.curv[i];
    if (d<170 || d>track.length-140 || !Number.isFinite(curve) || Math.abs(curve)<.012) continue;
    corners.push({d, curve});
  }
  corners.sort((a,b)=>Math.abs(b.curve)-Math.abs(a.curve));
  const chosen=[];
  for(const corner of corners) {
    if (chosen.every(other=>Math.abs(other.d-corner.d)>=180)) {
      chosen.push(corner);
      if(chosen.length>=maxCount)break;
    }
  }
  return chosen.sort((a,b)=>a.d-b.d);
}
/**
 * V9: Track's own physical fork has useful environment cues.
 * Do not hide them behind the legacy 7 x 7 metre opaque U-turn billboards.
 * Keep historic V8 and earlier behavior byte-for-byte compatible.
 */
export function v9CornerSignPresentation(track) {
  if(!track?.__V9_WIDTH_PROFILE__)
    return {scale:7,offset:5.5,height:4.3,panel:true};
  return {scale:3.8,offset:9.2,height:3.2,panel:false};
}
export function chooseV9CornerSigns(track) {
  const candidates=chooseCornerSigns(track);
  if(!track?.__V9_WIDTH_PROFILE__)return candidates;
  const fork=track?.__RACE_SHORTCUT__;
  const cleared=fork ? candidates.filter(corner=>
    Math.abs(corner.d-fork.start)>105 &&
    Math.abs(corner.d-fork.end)>105) : candidates;
  // Rare tracks with all bends at the shortcut still need one natural
  // road-direction cue; do not let a billboard forcefully overlap the fork.
  return (cleared.length?cleared:candidates).slice(0,4);
}

function arrowTexture(THREE,doc,left,quiet=false) {
  const c=doc.createElement('canvas');c.width=192;c.height=192;
  const ctx=c.getContext('2d');
  if(!ctx)return null;
  if(quiet){
    // Transparent paired road chevrons, not a full opaque square competing
    // with V9's smaller physical fork portals and road geometry.
    ctx.save();ctx.translate(96,96);if(left)ctx.scale(-1,1);
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const shift of [-21,22]){
      ctx.beginPath();
      ctx.moveTo(shift-18,-41);ctx.lineTo(shift+13,0);
      ctx.lineTo(shift-18,41);
      ctx.lineWidth=17;ctx.strokeStyle='rgba(30,44,54,.90)';ctx.stroke();
      ctx.lineWidth=10;ctx.strokeStyle='rgba(249,215,152,.98)';ctx.stroke();
    }
    ctx.restore();
    const texture=new THREE.CanvasTexture(c);
    texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  }
  ctx.fillStyle='rgba(7,39,64,.94)';
  ctx.beginPath();ctx.roundRect(8,8,176,176,26);ctx.fill();
  ctx.strokeStyle='#ffe081';ctx.lineWidth=10;ctx.stroke();
  // The same geometry is mirrored for left/right. No font or bitmap dependency.
  ctx.save();ctx.translate(96,91);if(left)ctx.scale(-1,1);
  ctx.strokeStyle='#fff2a1';ctx.fillStyle='#fff2a1';
  ctx.lineWidth=17;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(-46,20);ctx.lineTo(35,20);ctx.quadraticCurveTo(55,20,55,-5);
  ctx.lineTo(55,-24);ctx.stroke();
  ctx.beginPath();ctx.moveTo(21,-18);ctx.lineTo(55,-49);ctx.lineTo(76,-14);ctx.closePath();ctx.fill();
  ctx.restore();
  const texture=new THREE.CanvasTexture(c);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
export function disposeCornerSigns(game) {
  const old=game?.__RACE_CORNER_SIGNS__;
  if(!old)return;
  for(const sprite of old.sprites) sprite.parent?.remove(sprite);
  for(const material of old.materials) material.dispose();
  for(const texture of old.textures) texture.dispose();
  game.__RACE_CORNER_SIGNS__=null;
}
export function installCornerSigns(game,THREE,doc) {
  disposeCornerSigns(game);
  if(!game?.level || !game.track || !THREE?.Sprite || !doc?.createElement) return 0;
  const corners=chooseV9CornerSigns(game.track);
  const visual=v9CornerSignPresentation(game.track);
  if(!corners.length)return 0;
  const textures=[arrowTexture(THREE,doc,true,!visual.panel),arrowTexture(THREE,doc,false,!visual.panel)];
  if(textures.some(x=>!x))return 0;
  const materials=textures.map(texture=>new THREE.SpriteMaterial({
    map:texture,transparent:true,depthWrite:false,depthTest:true,
  }));
  const sprites=[];
  for(const corner of corners) {
    // Sign stands before the sharp turn and outside the guardrail.
    const sample=game.track.sample(corner.d-37,{});
    const direction=corner.curve>0 ? -1 : 1;
    const localHalf=typeof game.track.v9WidthAt==='function'
      ? game.track.v9WidthAt(corner.d-37) : game.track.halfW;
    const lateral=direction*(localHalf+visual.offset);
    const sprite=new THREE.Sprite(materials[corner.curve>0?0:1]);
    sprite.position.set(sample.x+sample.rx*lateral,
      sample.y+visual.height,sample.z+sample.rz*lateral);
    sprite.scale.set(visual.scale,visual.scale,1);
    game.level.add(sprite);sprites.push(sprite);
  }
  game.__RACE_CORNER_SIGNS__={sprites,materials,textures};
  return sprites.length;
}
