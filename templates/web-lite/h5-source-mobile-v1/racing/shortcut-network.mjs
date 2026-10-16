/** Optional physical forked roads for Dual-Key Racing.
 * Cars drive through world space along a shorter mesh; no teleport, fake
 * placement, rank mutation or automatic shortcut selection.
 * Four biomes remain; this module attaches real branches to 5 specific
 * distinct career courses. Rival AI stays on the legal long road.
 */
export const SHORTCUT_PLANS=Object.freeze({
  'race-05':{start:392,end:1060,width:17,label:'Temple canyon cut'},
  'race-10':{start:440,end:1156,width:16,label:'Lightning center lane'},
  'race-12':{start:1472,end:2164,width:17,label:'Ice spiral viaduct'},
  'race-13':{start:1784,end:2332,width:17,label:'Interchange insider'},
  'race-16':{start:1640,end:2188,width:17,label:'Crown cliff ledge'},
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mod=(v,n)=>((v%n)+n)%n;
const cubic=(a,b,c,d,t)=>{const r=1-t;return r*r*r*a+3*r*r*t*b+3*r*t*t*c+t*t*t*d;};
const relative=(d,origin,L)=>{let x=mod(d-origin,L);if(x>L/2)x-=L;return x;};
function samplesFor(track,plan){
  const a=track.sample(plan.start,{}),d=track.sample(plan.end,{});
  const chord=Math.hypot(d.x-a.x,d.z-a.z);
  if(chord<65||plan.end<=plan.start+130||plan.end>track.length-140||chord>=plan.end-plan.start-40)
    throw Error('Unsafe physical shortcut size/start/end');
  const k=chord*.32,p1={x:a.x+a.tx*k,z:a.z+a.tz*k,y:a.y},
    p2={x:d.x-d.tx*k,z:d.z-d.tz*k,y:d.y};
  const N=Math.max(72,Math.ceil(chord/1.5)),samples=[];
  for(let i=0;i<=N;i++){
    const t=i/N,x=cubic(a.x,p1.x,p2.x,d.x,t),z=cubic(a.z,p1.z,p2.z,d.z,t),
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
  if(length<65||gain<35)throw Error('Shortcut must be shorter but nontrivial');
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
    const atEntrance=other.arc>=8&&other.arc<=Math.min(95,length*.44)&&
      relative(onMain.d,start,track.length)>=-15&&
      relative(onMain.d,start,track.length)<=140&&
      other.dist<=cfg.width*.5-1.5&&Math.abs(y-other.y)<5.5;
    if(!(was||(atEntrance&&mainDist>other.dist+1.8))){
      onMain.__RACE_SHORTCUT_ACTIVE=false;return onMain;
    }
    // At both joining gates the ordinary surface resumes continuity.
    if((other.arc<8||other.arc>length-12)&&mainDist<=cfg.width*.5-1.5){
      onMain.__RACE_SHORTCUT_ACTIVE=false;return onMain;
    }
    const d=start+(end-start)*other.arc/length;
    Object.assign(onMain,{
      i:Math.floor(d/track.ds)%track.N,t:(d/track.ds)%1,d,
      x:other.px,z:other.pz,y:other.y,tx:other.tx,tz:other.tz,
      rx:other.rx,rz:other.rz,hd:other.hd,bank:0,
      lat:other.lat,surfY:other.y,
      __RACE_SHORTCUT_ACTIVE:true,__RACE_SHORTCUT_HALF_WIDTH:cfg.width*.5,
      __RACE_SHORTCUT_ARC:other.arc,
    });
    return onMain;
  };
  // Real visible opening in the main-road guardrail on the correct side.
  const opening=(d,side)=>{const a=relative(d,start,track.length),b=relative(d,end,track.length);
    return (side===entrySide&&a>-15&&a<96)||(side===exitSide&&b>-90&&b<18);
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
    player.proj.__RACE_SHORTCUT_HALF_WIDTH=cfg.width*.5;
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
    const elevated=course==='race-12'||course==='race-16';
    for(let i=0;i<samples.length;i++){const p=samples[i],j=main.N+i;
      px[j]=p.x;pz[j]=p.z;py[j]=p.y;bridge[j]=elevated?1:0;
    }
    return {N,px,py,pz,bridge,bounds:main.bounds,halfW:main.halfW};
  };
  const buildMesh=(THREE,groundAt)=>{
    const group=new THREE.Group();group.name='physical-shortcut-'+course;
    const vertices=[],uv=[],index=[];
    for(const p of samples)for(const side of [-1,1]){
      vertices.push(p.x+p.rx*side*cfg.width*.5,p.y+.08,p.z+p.rz*side*cfg.width*.5);
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
        const x=p.x+p.rx*side*(cfg.width*.5+.2),z=p.z+p.rz*side*(cfg.width*.5+.2),
          xx=q.x+q.rx*side*(cfg.width*.5+.2),zz=q.z+q.rz*side*(cfg.width*.5+.2);
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
  const shortcut={course,start,end,width:cfg.width,length,gain,samples,
    opening,project,recover,terrainProxy,buildMesh,drawMinimap};
  track.__RACE_SHORTCUT__=shortcut;track.project=project;
  return shortcut;
}
