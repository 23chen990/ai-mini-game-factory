/**
 * V8 offensive/defensive item rules. Native ItemSystem still owns real pickups,
 * two-slot storage, use timing, effects, collisions and the race outcome.
 * Three additional items are player/AI symmetric and have actual world effects.
 */
export const V8_ITEM_WEIGHTS=Object.freeze({
  lead:Object.freeze({banana:21,shield:23,nitro:18,missile:8,magnet:5,
    shockwave:10,thunder:5,barricade:10}),
  mid:Object.freeze({banana:12,shield:12,nitro:20,missile:18,magnet:12,
    shockwave:10,thunder:9,barricade:7}),
  back:Object.freeze({banana:2,shield:9,nitro:22,missile:21,magnet:17,
    shockwave:13,thunder:12,barricade:4}),
});
const finite = n => typeof n==='number'&&Number.isFinite(n);
const planar=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const drivable=(a,b)=>a!==b&&b&&!b.finished&&
  finite(a?.x)&&finite(b.x)&&finite(a?.y)&&finite(b.y)&&
  Math.abs(a.y-b.y)<6;
export function v8AiItemUseful(kind,driver,game) {
  if(!['shockwave','thunder','barricade'].includes(kind))return true;
  const peers=(game?.racers||[]).filter(r=>drivable(driver,r));
  if(kind==='shockwave')return peers.some(r=>planar(driver,r)<=16);
  if(kind==='thunder'){
    const ahead=game.racerAhead?.(driver);
    return ahead&&drivable(driver,ahead)&&
      ahead.progress-driver.progress>2&&ahead.progress-driver.progress<105;
  }
  return peers.some(r=>r.progress<driver.progress&&
    driver.progress-r.progress<60);
}
export function v8UseExtraItem(kind,driver,game,system,THREE) {
  if(!driver||!game||!system)return false;
  if(kind==='shockwave') {
    game.sfx('item',driver);
    game.fx?.burst?.(driver.x,driver.y+.7,driver.z,0x66e9ff);
    for(const r of game.racers||[])
      if(drivable(driver,r)&&planar(driver,r)<=15)game.hitRacer(r,'missile');
    return true;
  }
  if(kind==='thunder') {
    const target=game.racerAhead?.(driver);
    game.sfx('missile',driver);
    if(target&&drivable(driver,target)&&target.progress-driver.progress<=115){
      (system.v8Bolts??=[]).push({owner:driver,target,delay:.75});
      if(target.isPlayer)game.onMissileLock?.();
      game.fx?.burst?.(target.x,target.y+2,target.z,0xf4e86e);
    }
    return true;
  }
  if(kind==='barricade'&&THREE) {
    // World obstacle shares native banana collision & shield interception.
    const mesh=new THREE.Group();
    const mat=new THREE.MeshStandardMaterial({
      color:0xff852e,emissive:0x5f2405,roughness:.65});
    const body=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.4,.85),mat);
    body.position.y=.7;mesh.add(body);
    const marker=new THREE.Mesh(new THREE.BoxGeometry(2.8,.24,1.0),
      new THREE.MeshBasicMaterial({color:0xffe173}));
    marker.position.y=1.05;mesh.add(marker);
    const bx=driver.x-Math.sin(driver.h)*4.1,
      bz=driver.z-Math.cos(driver.h)*4.1;
    const road=system.track?.project?.(bx,driver.y,bz,driver.hint,{});
    if(!road){mesh.traverse(x=>{x.geometry?.dispose?.();x.material?.dispose?.()});return false;}
    mesh.position.set(bx,road.y+road.lat*Math.sin(road.bank??0)+.06,bz);
    system.group.add(mesh);
    system.bananas.push({mesh,owner:driver,age:0,__V8_BARRIER__:true});
    game.sfx('banana',driver);
    return true;
  }
  return false;
}
export function v8UpdateExtraItems(system,dt) {
  if(!system||!finite(dt)||dt<=0)return 0;
  let hits=0;
  const bolts=system.v8Bolts??[];
  for(let i=bolts.length-1;i>=0;i--) {
    const b=bolts[i];b.delay-=dt;
    if(b.delay>0)continue;
    const {owner,target}=b;
    if(drivable(owner,target) && planar(owner,target)<145) {
      system.game.hitRacer(target,'missile');
      system.game.fx?.burst?.(target.x,target.y+1.2,target.z,0xe5f6ff);
      hits++;
    }
    bolts.splice(i,1);
  }
  return hits;
}
export function v8DisposeBarrier(mesh) {
  if(!mesh?.traverse)return;
  const disposed=new Set();
  mesh.traverse(obj=>{
    const all=[obj.geometry,...(Array.isArray(obj.material)?obj.material:[obj.material])];
    for(const r of all)if(r&&!disposed.has(r)&&typeof r.dispose==='function'){
      disposed.add(r);r.dispose();
    }
  });
}
