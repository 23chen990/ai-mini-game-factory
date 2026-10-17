/**
 * V10 on-road high-speed perception: repeated real pavement edge marks and
 * two bespoke low-poly scenic compositions per 30 original stages.
 *
 * Geometry follows the ACTUAL 3D road and altitude, always outside the
 * drivable collision envelope; no painted fake ramps or invisible walls.
 * Keep H5 draw calls low by batching all edge ticks into ONE mesh.
 */
export const V10_SCENE_SIGNATURES=Object.freeze({
 '01':[[.19,'city-block'],[.78,'city-cranes']],
 '02':[[.23,'desert-ridges'],[.72,'desert-ruins']],
 '03':[[.27,'city-flyover'],[.71,'city-block']],
 '04':[[.20,'coast-sails'],[.74,'coast-terraces']],
 '05':[[.17,'desert-ruins'],[.84,'desert-pillars']],
 '06':[[.24,'city-cranes'],[.75,'city-flyover']],
 '07':[[.20,'coast-cliff'],[.70,'coast-ridge']],
 '08':[[.25,'ice-arches'],[.74,'ice-ridge']],
 '09':[[.16,'desert-pillars'],[.81,'desert-ridges']],
 '10':[[.26,'city-bridge'],[.69,'city-cranes']],
 '11':[[.22,'coast-ridge'],[.73,'coast-sails']],
 '12':[[.18,'ice-ridge'],[.77,'ice-bridge']],
 '13':[[.22,'city-block'],[.78,'city-bridge']],
 '14':[[.16,'desert-ridges'],[.81,'desert-ruins']],
 '15':[[.23,'ice-arches'],[.79,'ice-spires']],
 '16':[[.20,'coast-cliff'],[.78,'coast-terraces']],
 '17':[[.23,'city-flyover'],[.75,'city-bridge']],
 '18':[[.18,'desert-pillars'],[.72,'desert-ruins']],
 '19':[[.24,'coast-sails'],[.77,'coast-cliff']],
 '20':[[.19,'ice-spires'],[.72,'ice-arches']],
 '21':[[.22,'city-cranes'],[.73,'city-bridge']],
 '22':[[.17,'desert-terraces'],[.74,'desert-pillars']],
 '23':[[.22,'coast-terraces'],[.82,'coast-sails']],
 '24':[[.21,'ice-bridge'],[.75,'ice-spires']],
 '25':[[.23,'city-flyover'],[.75,'city-cranes']],
 '26':[[.20,'desert-pillars'],[.77,'desert-ridges']],
 '27':[[.19,'coast-cliff'],[.76,'coast-terraces']],
 '28':[[.20,'ice-arches'],[.79,'ice-bridge']],
 '29':[[.21,'city-block'],[.75,'city-bridge']],
 '30':[[.23,'coast-terraces'],[.79,'coast-cliff']],
});
const P=Object.freeze({
 city:[0x40536a,0x91b5c4],
 desert:[0x97744c,0xe4bc86],
 coast:[0x687d88,0xe0c19a],
 ice:[0x7da5b9,0xd9f0f0],
});
export function validateV10Environment(){
  if(Object.keys(V10_SCENE_SIGNATURES).length!==30)
    throw Error('Every V10 stage needs an authored cinematic skyline');
  for(let i=1;i<=30;i++){
    const id=String(i).padStart(2,'0'),scenes=V10_SCENE_SIGNATURES[id];
    if(!Array.isArray(scenes)||scenes.length!==2||scenes[0][1]===scenes[1][1])
      throw Error('Duplicate stage scene beat '+id);
    if(scenes.some(([f,type])=>!(f>.1&&f<.9)||!Object.keys(P).includes(type.split('-')[0])))
      throw Error('Invalid V10 scene config '+id);
  }
  return 30;
}
/** Geometry-only view-depth cues along both real shoulders. Painting marks
 * as one material / draw call makes speed visible without full-screen blur.
 */
export function buildV10RoadRumble(THREE,track,course) {
  const group=new THREE.Group();group.name='v10-road-speed-cues-'+course;
  if(!track?.__V10_STAGE_IDENTITY__||!Number.isFinite(track.length)||track.length<500)
    return group;
  const vertices=[],faces=[];
  const tick=3.4;
  const widthAt=d=>track.v9WidthAt?.(d)??track.halfW;
  for(let d=62;d<track.length-30;d+=36){
    const a=track.sample(d,{}),b=track.sample(d+tick,{});
    if(![a.x,a.y,a.z,a.rx,a.rz,b.x,b.y,b.z,b.rx,b.rz].every(Number.isFinite))
      throw Error('Invalid native road tick station '+course);
    const hwA=widthAt(d)-.80,hwB=widthAt(d+tick)-.80;
    for(const side of [-1,1]){
      const idx=vertices.length/3,w=.36;
      for(const p of [
        [a,side*(hwA-w)],[a,side*hwA],
        [b,side*(hwB-w)],[b,side*hwB]
      ])vertices.push(p[0].x+p[0].rx*p[1],
        p[0].y+p[1]*Math.sin(Number.isFinite(p[0].bank)?p[0].bank:0)+.115,
        p[0].z+p[0].rz*p[1]);
      faces.push(idx,idx+1,idx+2,idx+1,idx+3,idx+2);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setIndex(faces);geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({
    color:0xf2e9d5,roughness:.95,metalness:0,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-1,
  });
  const mesh=new THREE.Mesh(geo,mat);
  mesh.name='v10-native-rumble-edge-marks';mesh.receiveShadow=false;
  group.add(mesh);
  return group;
}
function groundedSceneDistance(track,f){
  const L=track.length,road=track.__RACE_SHORTCUT__;
  const candidates=[f,Math.min(.88,f+.12),Math.max(.13,f-.13)];
  if(!road)return candidates[0]*L;
  for(const t of candidates){
    const d=t*L;
    if(d<road.start-135||d>road.end+115)return d;
  }
  return candidates[0]*L;
}
export function buildV10CinematicWorld(THREE,track,course){
  const root=new THREE.Group();root.name='v10-roadside-identity-'+course;
  if(!track?.__V10_STAGE_IDENTITY__)return root;
  const id=String(course).replace(/^race-/,'');
  const designs=V10_SCENE_SIGNATURES[id];
  if(!designs)throw Error('Unknown authored V10 world '+course);
  const box=new THREE.BoxGeometry(1,1,1),
    cliff=new THREE.DodecahedronGeometry(1,0),
    prism=new THREE.CylinderGeometry(1,1,1,6),
    point=new THREE.OctahedronGeometry(1,0);
  const material=Object.fromEntries(Object.entries(P).map(([name,[base,light]])=>[
    name,[new THREE.MeshStandardMaterial({color:base,roughness:.94,metalness:.03}),
          new THREE.MeshStandardMaterial({color:light,roughness:.78,metalness:.03})]
  ]));
  const make=(parent,geometry,mat,x,y,z,sx,sy,sz)=>{
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
    mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  for(let i=0;i<designs.length;i++){
    const [f,type]=designs[i],kind=type.split('-')[0];
    const ds=groundedSceneDistance(track,f),at=track.sample(ds,{});
    const side=((Number(id)+i)%2===0)?1:-1;
    const hw=track.v9WidthAt?.(ds)??track.halfW;
    const group=new THREE.Group();group.name='v10-landmark-'+course+'-'+type;
    const offset=hw+31+(Number(id)*3+i)%9;
    group.position.set(at.x+side*at.rx*offset,at.y-5,
      at.z+side*at.rz*offset);
    group.rotation.y=at.hd;
    const [base,highlight]=material[kind],height=15+(Number(id)*7+i*5)%16;
    if(kind==='city'){
      // Distinct skyline layers and structural viaducts. NOT giant arch
      // signs over the actual road/shortcut.
      make(group,box,base,-9,height*.48,3,10,height,10);
      make(group,box,base,11,height*.29,-7,7,height*.61,9);
      make(group,box,highlight,-9,height+1.5,3,12,2.4,11);
      if(type==='city-cranes'){
        make(group,box,base,1,height+8,2,1.6,22,1.6);
        make(group,box,highlight,5,height+17,2,16,1.5,1.5);
      }else if(type==='city-flyover'||type==='city-bridge'){
        make(group,box,base,0,10,2,34,3,11);
        make(group,box,highlight,0,12,2,30,.7,10);
      }
    }else if(kind==='desert'){
      // Terraced cliffs and archaeological massing, not recycled cylinders.
      make(group,box,base,0,5.3,0,25,12,18);
      make(group,cliff,base,0,12,0,13,10,11);
      make(group,box,highlight,-4,12,2,20,1.6,18);
      if(type==='desert-ruins'){
        make(group,prism,base,13,14,-3,3,26,3);
        make(group,box,highlight,13,28,-3,9,2,8);
      }else if(type==='desert-pillars'){
        for(const x of [-12,0,12])
          make(group,box,highlight,x,13,-12,3,17,3);
      }
    }else if(kind==='ice'){
      // Stepped ridges establish real depth and snow plateau silhouettes.
      make(group,box,base,0,4,0,28,8,20);
      make(group,cliff,base,-4,10,0,15,10,16);
      make(group,point,highlight,0,17,-5,10,18,10);
      if(type==='ice-arches'||type==='ice-spires'){
        make(group,point,highlight,13,15,6,4,18,5);
        make(group,point,highlight,-13,14,-5,5,16,5);
      }else{
        make(group,box,highlight,0,24,2,20,1.3,17);
      }
    }else{
      // Sea-facing cliffs, stepped shore and sail-shaped landmark.
      make(group,cliff,base,0,8,0,18,12,14);
      make(group,box,base,0,2,0,31,6,20);
      make(group,box,highlight,-7,9,6,20,1.6,18);
      if(type==='coast-sails'){
        const sail=make(group,point,highlight,13,21,-4,5,20,4);
        sail.rotation.z=.18;
      }else if(type==='coast-ridge'||type==='coast-cliff'){
        make(group,cliff,base,-14,15,-8,13,15,12);
      }else make(group,box,highlight,14,14,-6,8,16,7);
    }
    // A signature is only visually near a road; all masses are well outside
    // the collision corridor and the real PlayerCar still owns wall physics.
    root.add(group);
  }
  return root;
}
validateV10Environment();
