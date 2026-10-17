/* V20 first-person cover-to-cover assault for lightweight landscape H5.
 * Native Three.js bullet rays, wall colliders, actor physics and Bot AI are
 * authoritative. This module never awards damage, kills or fake invulnerability.
 */
export function cfV20CoverEnabled(challenge) {
  return challenge?.lite===true&&['tags','survive'].includes(challenge.id);
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function cfCoverSteering(player,destination,stop=.45) {
  if(!player?.pos||![player.yaw,destination?.x,destination?.z].every(Number.isFinite))
    return {mx:0,mz:0,arrived:false};
  const dx=destination.x-player.pos.x,dz=destination.z-player.pos.z;
  const len=Math.hypot(dx,dz);
  if(len<=stop)return {mx:0,mz:0,arrived:true};
  const x=dx/len,z=dz/len,sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);
  return {mx:cy*x-sy*z,mz:-sy*x-cy*z,arrived:false};
}
export function cfCoverPath(nav,from,to) {
  if(!nav?.findPath||!from||!to)return null;
  const points=nav.findPath(from.x,from.z,to.x,to.z);
  if(!Array.isArray(points)||points.length<2)return null;
  const route=points.filter(p=>Array.isArray(p)&&p.length>=2&&
    Number.isFinite(p[0])&&Number.isFinite(p[1]))
    .map(p=>({x:p[0],z:p[1]}));
  if(route.length<2)return null;
  route[route.length-1]={x:to.x,z:to.z};
  return route;
}
export function cfCoverValidPoint(world,nav,point) {
  if(!world?.blocked||!nav?.idx||!nav?.walkable||!point||
    !Number.isFinite(point.x)||!Number.isFinite(point.z))return false;
  const index=nav.idx(point.x,point.z);
  return index>=0&&!!nav.walkable(index)&&
    !world.blocked(point.x,.04,point.z,.46,1.75);
}
/** Candidate walkable sideways destinations, not fictitious screen teleports.
 * The actual path is computed again AFTER barriers are added to the world.
 */
export function cfCoverCandidates({world,nav,player}={}) {
  if(!player?.pos||!Number.isFinite(player.yaw))return {left:null,right:null};
  const origin={x:player.pos.x,z:player.pos.z};
  const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);
  const result={left:null,right:null};
  for(const [name,side] of [['left',-1],['right',1]]) {
    for(const width of [3.8,5,6.2,2.8]) {
      if(result[name])break;
      for(const ahead of [0,1.2,-1.2]){
        const target={x:origin.x+side*cy*width-sy*ahead,
          z:origin.z-side*sy*width-cy*ahead};
        if(!cfCoverValidPoint(world,nav,target))continue;
        const path=cfCoverPath(nav,origin,target);
        if(!path||path.length>35)continue;
        result[name]={...target,side:name,pathLength:path.length};
        break;
      }
    }
  }
  return result;
}
export function cfCoverShieldSpec(pos,yaw) {
  if(!pos||![pos.x,pos.z,yaw].every(Number.isFinite))return null;
  // Just over crouched eye-height and below standing muzzle/eye-height.
  // Offset ~1.05m IN FRONT of the legal player stand point.
  return {x:pos.x-Math.sin(yaw)*1.06,y:.53,
    z:pos.z-Math.cos(yaw)*1.06,sx:1.8,sy:1.06,sz:.36,
    yaw,mat:'metal',solid:true,sight:true,bullet:'block',
    tag:'cf-v20-real-cover'};
}
/** Confirm actual original raycast obstruction while ducked. An icon alone
 * must never claim that the player is protected by a non-existent collider.
 */
export function cfCoverBlocksShot(world,position,enemy,eyeY=1.02) {
  if(!world?.raycast||!position||!enemy)return false;
  const dx=enemy.x-position.x,dz=enemy.z-position.z;
  const dy=1.30-eyeY,len=Math.hypot(dx,dy,dz);
  if(!(len>1))return false;
  const hit=world.raycast(position.x,eyeY,position.z,
    dx/len,dy/len,dz/len,len-.25,'bullet');
  return !!hit&&Number.isFinite(hit.t)&&hit.t>=0&&hit.t<len-.3;
}
export function cfCoverCanPlace(world,spec,playerPoint) {
  if(!world?.blocked||!spec||!playerPoint)return false;
  // Recheck the physical space that will receive the box collider.
  // Reject wall intersections instead of drawing fake cover through metal.
  for(const side of [-.62,0,.62]){
    const x=spec.x+Math.cos(spec.yaw)*side;
    const z=spec.z-Math.sin(spec.yaw)*side;
    if(world.blocked(x,.08,z,.18,1.08))return false;
  }
  return !world.blocked(playerPoint.x,.05,playerPoint.z,.40,1.73);
}
export function createCfCoverAssault(game,root,doc) {
  const html=doc.documentElement;
  const panel=doc.createElement('section');
  panel.id='mk-cover-raid';
  panel.hidden=true;
  panel.setAttribute('aria-label','单人掩体突击操作');
  panel.innerHTML='<div id="mk-cover-status" role="status">松手躲避 · 按住开火</div>'+
    '<nav id="mk-cover-nav" aria-label="选择可走的掩体位置">'+
    '<button id="mk-cover-left" type="button">← 左掩体</button>'+
    '<button id="mk-cover-right" type="button">右掩体 →</button></nav>';
  root.append(panel);
  const $=id=>panel.querySelector('#mk-cover-'+id);
  const buttons={left:$('left'),right:$('right')};
  let enabled=false,challenge=null,route=null,aimSide=null;
  let barriers=[],paths={left:null,right:null},sites={left:null,right:null};
  let lastStatus='',lastUi=0,stuckAt=0,lastProgress=null,failedRoutes=0;
  const clearInputs=()=>{
    route=null;
    const p=game.player;
    if(p?.touch){p.touch.mx=0;p.touch.mz=0;p.touch.crouch=false;}
  };
  function discardBarriers(){
    if(!barriers.length)return;
    const scene=game.renderer?.scene,world=game.world;
    for(const {collider,mesh} of barriers){
      scene?.remove?.(mesh);mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
      const index=world?.colliders?.indexOf?.(collider)??-1;
      if(index>=0)world.colliders.splice(index,1);
    }
    barriers=[];
    world?.build?.();
    // Original bot/NavGrid never gets a stale invisible cover wall.
    if(game.nav)rebuildNav();
  }
  function rebuildNav(){
    const old=game.nav;
    if(!old?.constructor||!old.cell||!old.w||!old.h)return false;
    const next=new old.constructor(game.world,old.x0,old.z0,
      old.x0+old.w*old.cell,old.z0+old.h*old.cell,
      old.cell,.42);
    if(!next?.findPath)return false;
    game.nav=next;
    return true;
  }
  function installBarrier(pos,yaw) {
    const spec=cfCoverShieldSpec(pos,yaw);
    if(!cfCoverCanPlace(game.world,spec,pos))return false;
    const THREE=game.T;
    if(!THREE?.BoxGeometry||!THREE?.MeshStandardMaterial||!THREE?.Mesh)return false;
    const geometry=new THREE.BoxGeometry(spec.sx,spec.sy,spec.sz);
    const material=new THREE.MeshStandardMaterial({
      color:0x52616b,metalness:.58,roughness:.67
    });
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(spec.x,spec.y,spec.z);
    mesh.rotation.y=spec.yaw;
    mesh.castShadow=false;mesh.receiveShadow=true;
    game.renderer?.scene?.add(mesh);
    const collider=game.world.add(spec);
    barriers.push({collider,mesh});
    return true;
  }
  function begin(challengeInput){
    discardBarriers();
    challenge=challengeInput;
    enabled=cfV20CoverEnabled(challenge);
    html.dataset.fpsCover=String(enabled);
    root.dataset.fpsCover=String(enabled);
    panel.hidden=!enabled;
    route=null;aimSide=null;sites={left:null,right:null};
    paths={left:null,right:null};failedRoutes=0;lastUi=0;lastStatus='';
    clearInputs();
    if(!enabled)return {enabled:false};
    const p=game.player;
    if(!p?.pos||!game.world||!game.nav)return {enabled:true,ready:false};
    // Author only small, real waist-high world geometry at legal sites.
    // Plan in original NavGrid, then rebuild after collision is installed.
    const candidates=cfCoverCandidates({world:game.world,nav:game.nav,player:p});
    const want=[{x:p.pos.x,z:p.pos.z,side:'start'},...Object.values(candidates).filter(Boolean)];
    let created=0;
    for(const site of want){
      if(installBarrier(site,p.yaw))created++;
    }
    if(created){
      game.world.build();rebuildNav();
    }
    const here={x:p.pos.x,z:p.pos.z};
    for(const side of ['left','right']){
      const point=candidates[side];
      const path=point&&cfCoverPath(game.nav,here,point);
      if(path){sites[side]=point;paths[side]=path;}
    }
    if(p.touch){p.touch.crouch=true;p.touch.mx=0;p.touch.mz=0;}
    refreshUi(true);
    game.__mkCoverV20={enabled:true,mode:'cover-to-cover',
      barriers:created,available:Object.keys(sites).filter(x=>sites[x]).length,
      realWorldColliders:barriers.length,routeMoves:0,failedRoutes:0};
    return game.__mkCoverV20;
  }
  function choose(side) {
    if(!enabled||!sites[side]||!game.player?.alive||
      !game.playing||game.paused||game.ended)return false;
    const p=game.player;
    if(p.touch?.fire||p.mouse?.l)return false;
    const from={x:p.pos.x,z:p.pos.z},to=sites[side];
    const path=cfCoverPath(game.nav,from,to);
    if(!path){failedRoutes++;refreshUi(true);return false;}
    route=path.slice(1);aimSide=side;lastProgress={x:p.pos.x,z:p.pos.z};
    stuckAt=Number(game.time)||0;
    if(game.__mkCoverV20){
      game.__mkCoverV20.routeMoves++;game.__mkCoverV20.failedRoutes=failedRoutes;
    }
    refreshUi(true);
    return true;
  }
  function isButton(target){
    return !!target?.closest?.('#mk-cover-nav');
  }
  function release(){clearInputs();}
  function onFire(pressed){
    if(!enabled)return;
    const p=game.player;
    if(!p?.touch)return;
    if(pressed){route=null;p.touch.mx=0;p.touch.mz=0;}
    p.touch.crouch=!pressed;
  }
  function refreshUi(force=false){
    if(!enabled)return;
    const now=Number(game.time)||0;
    if(!force&&now-lastUi<.12)return;
    lastUi=now;
    const p=game.player;
    for(const side of ['left','right']){
      const b=buttons[side];
      b.disabled=!sites[side]||!p?.alive||!!route;
    }
    const status=route?'↔ 沿真实路径换位中':
      p?.touch?.fire?'◎ 探身射击 · 松手藏回掩体':
      !p?.alive?'等待原生复活':'▣ 掩体后 · 按住开火，松手躲避';
    if(lastStatus!==status){$('status').textContent=status;lastStatus=status;}
  }
  function update(running){
    panel.hidden=!enabled||!running;
    if(!enabled)return;
    const p=game.player;
    if(!running||!p?.alive){release();refreshUi();return;}
    if(!p.touch)return;
    // Disable WASD and the old stick ONLY in the cover microgame; native
    // actor.move() still performs all steering, collisions and animation.
    for(const key of ['KeyW','KeyA','KeyS','KeyD',
      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])p.keys?.delete?.(key);
    if(p.touch.fire||p.mouse?.l){
      p.touch.mx=0;p.touch.mz=0;p.touch.crouch=false;
      route=null;
    } else if(route?.length){
      p.touch.crouch=false;
      const wp=route[0];
      const steer=cfCoverSteering(p,wp,.55);
      p.touch.mx=steer.mx;p.touch.mz=steer.mz;
      if(steer.arrived)route.shift();
      const sec=Number(game.time)||0;
      if(lastProgress&&distance(lastProgress,p.pos)>.16){
        lastProgress={x:p.pos.x,z:p.pos.z};stuckAt=sec;
      }
      if(sec-stuckAt>1.65){ // Collision genuinely blocked us; stop, don't teleport.
        failedRoutes++;route=null;
        if(game.__mkCoverV20)game.__mkCoverV20.failedRoutes=failedRoutes;
      }
      if(route?.length===0){
        route=null;
        const target=sites[aimSide];
        if(target&&distance(target,p.pos)<1.35){
          // Replan cover hops around CURRENT legal player location.
          const next=cfCoverCandidates({world:game.world,nav:game.nav,player:p});
          for(const side of ['left','right']){
            if(next[side]&&cfCoverPath(game.nav,p.pos,next[side]))sites[side]=next[side];
            else sites[side]=null;
          }
        }
      }
      if(!route){p.touch.mx=0;p.touch.mz=0;p.touch.crouch=true;}
    } else {
      p.touch.mx=0;p.touch.mz=0;p.touch.crouch=true;
    }
    // Native weaponUpdate consumes KeyR and handles the actual reload timer,
    // ammo reserve, sound and visual animation; no instant refill.
    if(p.weapon?.mag===0&&p.weapon?.canReload?.()&&!p.touch.fire)
      p.pressed?.add?.('KeyR');
    refreshUi();
  }
  const clickLeft=()=>choose('left'),clickRight=()=>choose('right');
  buttons.left.addEventListener('click',clickLeft);
  buttons.right.addEventListener('click',clickRight);
  return {begin,update,release,onFire,choose,isButton,
    get enabled(){return enabled;},
    get state(){return game.__mkCoverV20;},
    beforeNativeStart(){enabled=false;panel.hidden=true;clearInputs();discardBarriers();
      html.dataset.fpsCover='false';root.dataset.fpsCover='false';},
    destroy(){
      buttons.left.removeEventListener('click',clickLeft);
      buttons.right.removeEventListener('click',clickRight);
      enabled=false;release();discardBarriers();panel.remove();
      html.removeAttribute('data-fps-cover');
      root.removeAttribute('data-fps-cover');
    }};
}
