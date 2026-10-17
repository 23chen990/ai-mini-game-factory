/** Optional physical forked roads for Dual-Key Racing.
 * V3.8 replaces 400-580m long 16-17m wide "free second highways" with
 * local inside-corner technical cuts. Inspired by the *decision structure*
 * of kart racers; no QQ Speed coordinates, names, models or licensed assets.
 * Drivers must line up for a short opening, negotiate a narrowing S bend,
 * and merge back safely. Native physics/collisions decide if it was faster.
 * No teleport, virtual speed reward, rank or finish mutation.
 */
export const SHORTCUT_PLANS=Object.freeze({
  'race-05':{start:915,end:1310,width:13,neckWidth:10,bend:25,label:'Temple inner U'},
  'race-10':{start:615,end:970,width:12,neckWidth:9,bend:30,label:'Neon inside hairpin'},
  'race-12':{start:1890,end:2270,width:13,neckWidth:10,bend:18,label:'Ice ridge choice'},
  'race-13':{start:844,end:1248,width:12,neckWidth:9,bend:30,label:'Rebuilt crown inside switchback'},
  'race-16':{start:1565,end:1885,width:11.5,neckWidth:8.5,bend:25,label:'Cliffside technical cut'},
  // Every later shortcut is a REAL guarded fork using native Track.project:
  // do not credit laps or reward speed without physical road entry.
  'race-18':{start:606,end:1026,width:12,neckWidth:9.3,bend:30,label:'Dune chicane inside choice'},
  'race-22':{start:504,end:891,width:12,neckWidth:9.3,bend:24,label:'Ridge hairpin line'},
  'race-25':{start:1354,end:1707,width:12,neckWidth:9.3,bend:24,label:'Quantum short exit'},
  'race-27':{start:334,end:721,width:12,neckWidth:9.3,bend:30,label:'Cloud serpent crosscut'},
  'race-30':{start:1728,end:2148,width:11.5,neckWidth:8.8,bend:24,label:'Skyline final-risk apex'},
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mod=(v,n)=>((v%n)+n)%n;
const cubic=(a,b,c,d,t)=>{const r=1-t;return r*r*r*a+3*r*r*t*b+3*r*t*t*c+t*t*t*d;};
const relative=(d,origin,L)=>{let x=mod(d-origin,L);if(x>L/2)x-=L;return x;};
function samplesFor(track,plan){
  const a=track.sample(plan.start,{}),d=track.sample(plan.end,{});
  const chord=Math.hypot(d.x-a.x,d.z-a.z);
  if(chord<65||plan.end<=plan.start+130||plan.end>track.length-110||chord>=plan.end-plan.start-16)
    throw Error('Unsafe physical shortcut size/start/end');
  const k=chord*.32,p1={x:a.x+a.tx*k,z:a.z+a.tz*k,y:a.y},
    p2={x:d.x-d.tx*k,z:d.z-d.tz*k,y:d.y};
  const N=Math.max(72,Math.ceil(chord/1.5)),samples=[];
  const nx=-(d.z-a.z)/chord,nz=(d.x-a.x)/chord;
  for(let i=0;i<=N;i++){
    const t=i/N;
    // A smooth, small left/right steering decision INSIDE the shortcut,
    // zero offset and derivative at both merge portals.
    const waviness=plan.bend*Math.sin(Math.PI*t)**2*Math.sin(2*Math.PI*t);
    const x=cubic(a.x,p1.x,p2.x,d.x,t)+nx*waviness,
      z=cubic(a.z,p1.z,p2.z,d.z,t)+nz*waviness,
      y=cubic(a.y,p1.y,p2.y,d.y,t),last=samples.at(-1),
      arc=(last?.arc??0)+(last?Math.hypot(x-last.x,z-last.z):0);
    samples.push({x,z,y,arc});
  }
  for(let i=0;i<samples.length;i++){
    const p=samples[Math.max(0,i-1)],q=samples[Math.min(samples.length-1,i+1)],
      dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz);
    if(len<.001)throw Error('Degenerate shortcut tangent');
    const tx=dx/len,tz=dz/len;
    Object.assign(samples[i],{tx,tz,rx:-tz,rz:tx,hd:Math.atan2(tx,tz)});
  }
  const length=samples.at(-1).arc,gain=plan.end-plan.start-length;
  if(length<75||gain<25||gain>90)
    throw Error('Shortcut must earn a small skill-based saving, not a free highway');
  return {samples,length,gain};
}
function nearest(samples,x,z){
  let best=null;
  for(let i=0;i<samples.length-1;i++){
    const a=samples[i],b=samples[i+1],dx=b.x-a.x,dz=b.z-a.z,
      len2=dx*dx+dz*dz;
    if(len2<.001)continue;
    const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/len2,0,1),
      px=a.x+dx*t,pz=a.z+dz*t,dist=Math.hypot(x-px,z-pz);
    if(!best||dist<best.dist){
      const l=Math.sqrt(len2),tx=dx/l,tz=dz/l;
      best={px,pz,dist,arc:a.arc+(b.arc-a.arc)*t,y:a.y+(b.y-a.y)*t,
        tx,tz,rx:-tz,rz:tx,hd:Math.atan2(tx,tz),
        lat:(x-px)*(-tz)+(z-pz)*tx};
    }
  }
  return best;
}
export function installPhysicalShortcut(track,course){
  const cfg=SHORTCUT_PLANS[course];if(!cfg)return null;
  if(!track||typeof track.sample!=='function'||typeof track.project!=='function')
    throw Error('Physical shortcut needs real native Track');
  const {samples,length,gain}=samplesFor(track,cfg),start=cfg.start,end=cfg.end;
  const widthAt=arc=>cfg.width-(cfg.width-cfg.neckWidth)*
    Math.sin(Math.PI*clamp(arc/length,0,1))**2;
  const ahead=track.sample(start+65,{}),probe=samples[Math.floor(samples.length*.26)],
    entrySide=Math.sign((probe.x-ahead.x)*ahead.rx+(probe.z-ahead.z)*ahead.rz)||1,
    before=track.sample(end-65,{}),exitProbe=samples[Math.floor(samples.length*.74)],
    exitSide=Math.sign((exitProbe.x-before.x)*before.rx+(exitProbe.z-before.z)*before.rz)||1;
  const nativeProject=track.project.bind(track),nativeNearest=track.nearest?.bind(track);
  if(nativeNearest)track.nearest=(x,z,maxDist=60)=>{
    const main=nativeNearest(x,z,maxDist),other=nearest(samples,x,z);
    if(other&&other.dist<maxDist&&(!main||other.dist<main.dist)){
      const d=start+(end-start)*other.arc/length;
      return {dist:other.dist,i:Math.floor(d/track.ds)%track.N};
    }
    return main;
  };
  const project=(x,y,z,hint,out)=>{
    const was=out?.__RACE_SHORTCUT_ACTIVE===true;
    const onMain=nativeProject(x,y,z,hint,out),mainDist=Math.abs(onMain.lat),
      other=nearest(samples,x,z);
    if(!other)return onMain;
    const atEntrance=other.arc>=6&&other.arc<=Math.min(58,length*.25)&&
      relative(onMain.d,start,track.length)>=-12&&
      relative(onMain.d,start,track.length)<=88&&
      other.dist<=widthAt(other.arc)*.5-1.3&&Math.abs(y-other.y)<5.5;
    if(!(was||(atEntrance&&mainDist>other.dist+1.8))){
      onMain.__RACE_SHORTCUT_ACTIVE=false;return onMain;
    }
    // At both joining gates the ordinary surface resumes continuity.
    if((other.arc<7||other.arc>length-13)&&mainDist<=cfg.width*.5-1.3){
      onMain.__RACE_SHORTCUT_ACTIVE=false;return onMain;
    }
    const d=start+(end-start)*other.arc/length;
    Object.assign(onMain,{
      i:Math.floor(d/track.ds)%track.N,t:(d/track.ds)%1,d,
      x:other.px,z:other.pz,y:other.y,tx:other.tx,tz:other.tz,
      rx:other.rx,rz:other.rz,hd:other.hd,bank:0,
      lat:other.lat,surfY:other.y,
      __RACE_SHORTCUT_ACTIVE:true,__RACE_SHORTCUT_HALF_WIDTH:widthAt(other.arc)*.5,
      __RACE_SHORTCUT_ARC:other.arc,
    });
    return onMain;
  };
  // Real visible opening in the main-road guardrail on the correct side.
  const opening=(d,side)=>{const a=relative(d,start,track.length),b=relative(d,end,track.length);
    return (side===entrySide&&a>-11&&a<58)||(side===exitSide&&b>-48&&b<14);
  };
  const recover=player=>{
    if(!player?.proj?.__RACE_SHORTCUT_ACTIVE)return false;
    const s=clamp((player.proj.__RACE_SHORTCUT_ARC??0)-12,1,length-10);
    let k=1;while(k<samples.length-1&&samples[k].arc<s)k++;
    const at=nearest(samples,samples[k].x,samples[k].z);
    player.x=at.px;player.y=at.y;player.z=at.pz;
    player.h=at.hd;player.m=at.hd;player.s=12;player.lat=0;
    player.wrongWay=0;player.airborne=false;player.vy=0;
    player.proj.__RACE_SHORTCUT_ACTIVE=true;
    player.proj.__RACE_SHORTCUT_HALF_WIDTH=widthAt(at.arc)*.5;
    player.proj.__RACE_SHORTCUT_ARC=at.arc;
    player.d=start+(end-start)*at.arc/length;
    player.hint=Math.floor(player.d/track.ds)%track.N;
    player.lastD=player.d;
    return true;
  };
  // Terrain flattening accounts for BOTH legal road surfaces.
  const terrainProxy=main=>{
    const N=main.N+samples.length,
      px=new Float32Array(N),py=new Float32Array(N),pz=new Float32Array(N),bridge=new Uint8Array(N);
    px.set(main.px);py.set(main.py);pz.set(main.pz);bridge.set(main.bridge);
    const elevated=['race-12','race-16','race-27','race-30'].includes(course);
    for(let i=0;i<samples.length;i++){const p=samples[i],j=main.N+i;
      px[j]=p.x;pz[j]=p.z;py[j]=p.y;bridge[j]=elevated?1:0;
    }
    return {N,px,py,pz,bridge,bounds:main.bounds,halfW:main.halfW};
  };
  const buildMesh=(THREE,groundAt)=>{
    const group=new THREE.Group();group.name='physical-shortcut-'+course;
    const vertices=[],uv=[],index=[];
    for(const p of samples)for(const side of [-1,1]){
      vertices.push(p.x+p.rx*side*widthAt(p.arc)*.5,p.y+.08,
        p.z+p.rz*side*widthAt(p.arc)*.5);
      uv.push((side+1)*.5,p.arc/23);
    }
    for(let i=0;i<samples.length-1;i++){const a=2*i;index.push(a,a+1,a+2,a+1,a+3,a+2);}
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(index);
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
      color:0x536b7c,roughness:.93,side:THREE.DoubleSide,
    }));
    mesh.name='physical-shortcut-road';mesh.receiveShadow=true;group.add(mesh);
    for(const side of [-1,1]){
      const rails=[];
      for(let i=0;i<samples.length-1;i++){
        const p=samples[i],q=samples[i+1];
        if(p.arc<18||p.arc>length-18)continue;
        const x=p.x+p.rx*side*(widthAt(p.arc)*.5+.2),
          z=p.z+p.rz*side*(widthAt(p.arc)*.5+.2),
          xx=q.x+q.rx*side*(widthAt(q.arc)*.5+.2),
          zz=q.z+q.rz*side*(widthAt(q.arc)*.5+.2);
        rails.push(x,p.y+.08,z,xx,q.y+.08,zz,xx,q.y+1.25,zz,
          x,p.y+.08,z,xx,q.y+1.25,zz,x,p.y+1.25,z);
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(rails,3));
      g.computeVertexNormals();
      const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({
        color:0x4bdbea,side:THREE.DoubleSide,roughness:.72,
      }));
      m.name='physical-shortcut-rails';group.add(m);
    }
    // Two low-cost beacons flank the actual entrance. They communicate an
    // optional physical route without text pop-ups or free teleport arrows.
    for(const progress of [20,length-21]){
      const sample=samples.find(p=>p.arc>=progress)??samples.at(-1);
      for(const side of [-1,1]){
        const h=4.8;
        const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.45,.6,h,6),
          new THREE.MeshStandardMaterial({color:0x49e4d9,emissive:0x125e63,
            emissiveIntensity:.6,roughness:.6}));
        const half=widthAt(sample.arc)*.5;
        beacon.position.set(sample.x+sample.rx*side*(half+1.9),
          sample.y+h*.5,sample.z+sample.rz*side*(half+1.9));
        beacon.name='physical-shortcut-gate';group.add(beacon);
      }
    }
    if(typeof groundAt==='function')for(let i=18;i<samples.length-18;i+=18){
      const p=samples[i],h=groundAt(p.x,p.z),rise=p.y-h-1.1;
      if(rise>4){
        const support=new THREE.Mesh(new THREE.CylinderGeometry(.85,1.1,rise,6),
          new THREE.MeshStandardMaterial({color:0x748ca2,roughness:.92}));
        support.position.set(p.x,h+rise*.5,p.z);group.add(support);
      }
    }
    return group;
  };
  const drawMinimap=hud=>{
    if(!hud?.mmBase||!hud?.mmT)return false;
    const ctx=hud.mmBase.getContext('2d');if(!ctx)return false;
    ctx.beginPath();
    for(let i=0;i<samples.length;i+=3){
      const [x,y]=hud.mmT(samples[i].x,samples[i].z);
      if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.strokeStyle='rgba(8,19,34,.9)';ctx.lineWidth=8;ctx.stroke();
    ctx.strokeStyle='rgba(90,235,255,.98)';ctx.lineWidth=4;ctx.stroke();
    return true;
  };
  const shortcut={course,start,end,width:cfg.width,neckWidth:cfg.neckWidth,
    length,gain,samples,widthAt,opening,project,recover,terrainProxy,buildMesh,drawMinimap};
  track.__RACE_SHORTCUT__=shortcut;track.project=project;
  return shortcut;
}
