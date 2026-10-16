/** V3.5: Four distinct ORIGINAL racing rhythms inspired by kart-racer design principles.
 * No competitor map coordinates, assets, branch shortcuts, checkpoint edits, speed buffs
 * or reduced career goals. Each cut is anchored to the exact pinned upstream layout.
 * Index ranges refer to ORIGINAL upstream qq-speed/src/layouts.js (not V3.4 output).
 * All cuts are descending, disjoint, and preserve tunnels, major bridges and pads.
 * Near-rail difficulty is verified by real Track/PlayerCar physics in Racing CI.
 */
export const TRACK_RESHAPES = Object.freeze({
  city: {
    expected: 29, width: 23,
    theme: '都市双S / 东侧弧角反切 / 北环连续变线 / 桥区回头',
    cuts: [
      { start: 19, end: 20, first: [-170,290,0], last: [-240,240,0],
        points: [[-170,290,0],[-210,296,0],[-238,255,0],[-240,240,0]] },
      { start: 16, end: 18, first: [70,330,0], last: [-90,290,0],
        points: [[70,332,0],[20,325,0],[-18,338,0],[-90,292,0]] },
      { start: 8, end: 10, first: [215,110,2], last: [360,190,0],
        points: [[215,110,2],[241,149,1],[261,171,0],[315,160,0],[360,190,0]] },
      { start: 1, end: 2, first: [-140,-152,0], last: [20,-150,0],
        points: [[-245,-164,0],[-180,-152,0],[-140,-152,0],
          [-100,-102,0],[-40,-105,0],[20,-150,0]] },
    ],
  },
  aegean: {
    expected: 24, width: 21,
    theme: '海湾换线 / 山腰连发卡 / 山脊起伏 / 隧道前后节奏',
    cuts: [
      { start: 17, end: 19, first: [80,318,17], last: [-180,250,12],
        points: [[80,318,17],[28,288,19],[-32,331,21],[-94,281,17],[-180,250,12]] },
      { start: 14, end: 16, first: [300,180,17], last: [200,310,18],
        points: [[300,180,17],[310,238,20],[258,302,21],[200,310,18]] },
      { start: 8, end: 11, first: [20,12,9], last: [10,118,12],
        points: [[20,12,9],[-19,-2,10],[-72,33,11],[-69,95,12],[10,118,12]] },
      { start: 5, end: 7, first: [255,5,5], last: [110,20,8],
        points: [[255,5,5],[213,33,7],[157,-4,8],[110,20,8]] },
      { start: 1, end: 2, first: [-60,-178,0], last: [110,-168,0],
        points: [[-181,-174,0],[-120,-155,0],[-60,-178,0],[-15,-167,0],
          [32,-135,0],[70,-145,0],[110,-168,0]] },
    ],
  },
  egypt: {
    expected: 25, width: 22,
    theme: '神殿跳台 / 沙丘北环S弯 / 东侧高速变向 / 南部收尾弧角',
    cuts: [
      { start: 22, end: 24, first: [120,-410,0], last: [-20,-420,0],
        points: [[120,-410,0],[72,-458,0],[18,-452,0],[-20,-420,0]] },
      { start: 18, end: 21, first: [345,-70,0], last: [160,-320,0],
        points: [[345,-70,0],[330,-130,0],[290,-172,1.5],
          [302,-218,2.8],[232,-260,1.2],[160,-320,0]] },
      { start: 15, end: 17, first: [300,150,0], last: [300,5,0],
        points: [[300,150,0],[266,124,0],[262,81,0],[300,5,0]] },
      { start: 11, end: 13, first: [-70,400,0], last: [190,330,0],
        points: [[-70,400,0],[-8,372,1.6],[65,380,3],[125,352,1.4],[190,330,0]] },
      { start: 7, end: 10, first: [-30,215,0], last: [-190,375,0],
        points: [[-30,215,0],[-120,214,0],[-218,286,0],[-190,375,0]] },
      { start: 5, end: 6, first: [2,58,.4], last: [20,140,0],
        points: [[2,58,.4],[33,97,0],[20,140,0]] },
    ],
  },
  snow: {
    expected: 21, width: 22,
    theme: '雪岭双弧 / 16米高架错层 / 8字跨线 / 下环左右换向',
    cuts: [
      { start: 16, end: 18, first: [-170,-60,0], last: [-340,-60,0],
        points: [[-170,-60,0],[-206,-30,0],[-258,2,0],[-314,-28,0],[-340,-60,0]] },
      { start: 12, end: 15, first: [165,140,0], last: [-80,-50,0],
        points: [[165,140,0],[133,92,0],[75,68,0],[0,0,0],[-80,-50,0]] },
      { start: 8, end: 11, first: [-60,200,8], last: [170,230,0],
        points: [[-60,200,8],[-82,266,8],[-35,317,10],[35,298,12],
          [80,312,9],[130,280,4],[170,230,0]] },
      { start: 4, end: 7, first: [220,-60,2], last: [-20,120,10],
        points: [[220,-60,2],[169,3,8],[92,47,15],[38,80,16],[-20,120,10]] },
      { start: 1, end: 2, first: [-40,-200,0], last: [110,-190,0],
        points: [[-40,-200,0],[-6,-207,0],[38,-183,0],[75,-204,0],[110,-190,0]] },
    ],
  },
});

/**
 * V3.7: SIXTEEN independently hand-authored course silhouettes.
 *
 * The previous V3.6 variants only moved 4-7 points on four shared routes.
 * These 16 original closed-loop sketches each have their own full geometry,
 * sector personality and recognisable top-down footprint. Coordinates in
 * sketches are local x,z,height metres (positive x = initial travel).
 *
 * Four biome art systems are still shared; unique road geometry does NOT mean
 * sixteen licensed or independently modelled environment packs.
 * No competitor coordinates, branded artwork or renamed copies.
 */
export const CAREER_COURSE_MAPS = Object.freeze(
  'city egypt city aegean egypt city aegean snow egypt city aegean snow city egypt snow aegean'.split(' '));
export const COURSE_BLUEPRINTS = Object.freeze({
  '01': ['新城练习环','宽弧入门','NEON START',1,'0,0,0 140,0,0 330,5,0 475,70,0 550,190,0 545,330,0 460,435,0 320,480,0 150,455,0 0,395,0 -85,280,0 -95,140,0'],
  '02': ['风蚀箭谷','高速跳台','DUNE SPRINT',1,'0,0,0 185,0,0 400,-10,0 565,15,7 650,120,13 660,270,4 610,360,1 490,370,0 420,300,0 370,205,0 290,200,0 230,300,0 120,420,0 -65,430,0 -195,345,0 -210,190,0 -145,70,0'],
  '03': ['风车立交','双层切线','OVERPASS PINWHEEL',1,'0,0,0 170,-10,0 330,5,0 475,105,2 490,220,7 405,315,11 325,300,7 235,260,2 195,350,0 245,470,0 120,550,0 -45,510,0 -145,380,0 -110,265,0 -5,235,0 55,175,0 -55,125,0 -120,35,0'],
  '04': ['海鸥湾','海崖连漂','GULLWING COAST',1,'0,0,0 170,-15,2 340,0,5 455,65,8 490,200,13 610,220,18 670,340,21 620,445,19 480,465,15 390,415,13 300,430,17 170,525,18 -5,500,14 -140,405,10 -165,275,7 -80,190,6 50,200,7 115,125,4 -15,85,2'],
  '05': ['失落神殿','马蹄峡谷近道','TEMPLE HORSESHOE',1,'0,0,0 175,-10,0 340,35,0 490,115,0 595,260,0 590,400,0 500,500,4 360,495,8 300,410,11 305,315,7 210,280,1 120,350,0 55,485,0 -100,470,0 -195,350,0 -200,175,0 -130,45,0'],
  '06': ['双城回廊','环区穿梭','TWIN DISTRICT',0.76,'0,0,0 185,-5,0 375,0,0 500,80,2 490,215,5 375,310,8 245,320,8 175,245,7 155,155,4 50,140,2 -30,215,0 -80,360,0 -15,480,0 130,530,0 255,505,0 345,435,0 410,480,0 420,615,0 270,695,0 60,670,0 -130,580,0 -235,415,0 -225,230,0 -130,80,0'],
  '07': ['海崖阶梯','断崖连续下坡','CLIFF STEPS',1,'0,0,0 170,0,1 350,0,3 485,50,5 530,140,8 470,225,13 370,245,17 260,230,20 220,315,22 315,400,23 415,420,22 460,510,20 325,580,17 160,570,14 80,475,13 0,390,11 -125,410,10 -230,340,8 -230,185,5 -140,65,2'],
  '08': ['雪岭Ω环','雪地双弧','SNOW OMEGA',0.7,'0,0,0 165,-5,0 335,10,2 470,100,7 525,230,11 475,350,15 335,410,17 205,355,14 155,255,11 65,220,8 -60,305,7 -60,460,9 65,570,11 230,595,9 380,585,7 500,520,5 600,405,3 625,240,1 545,65,0 410,-75,0 225,-100,0 35,-75,0 -100,-20,0'],
  '09': ['仙人掌岭','错峰补时','CACTUS RIDGE',0.86,'0,0,0 170,0,0 340,20,0 440,120,0 450,285,4 525,335,9 630,305,7 740,365,2 745,490,0 660,570,0 540,530,0 440,425,0 335,400,0 290,530,0 135,580,0 -10,510,0 -55,395,0 25,300,0 150,240,0 85,150,0 -45,85,0'],
  '10': ['霓虹闪电','折返捷径','NEON LIGHTNING',0.86,'0,0,0 190,0,0 370,30,0 495,120,0 440,210,0 320,240,0 265,340,0 330,445,0 490,510,0 535,630,0 420,715,0 250,700,0 105,640,0 -35,540,0 -55,420,0 65,355,0 140,275,0 45,175,0 -105,115,0 -100,10,0'],
  '11': ['海蛇湾','山腰长S弯','SERPENT BAY',0.91,'0,0,0 180,-10,0 365,20,2 490,95,4 530,200,8 460,275,11 305,270,15 230,370,19 290,490,22 440,535,21 455,645,19 310,695,16 140,670,14 60,590,13 -5,485,11 -120,470,8 -225,360,6 -185,215,3 -65,125,1'],
  '12': ['冰旋高架','错层冰桥近道','FROST SPIRAL',0.72,'0,0,0 160,-5,0 330,15,0 495,85,4 580,215,9 560,385,14 430,515,18 270,550,21 145,465,18 145,325,14 245,245,10 340,305,8 360,430,6 265,670,5 75,700,4 -95,600,3 -220,430,2 -225,240,1 -130,75,0'],
  '13': ['皇冠立交','技术近道车神','CROWN INTERCHANGE',0.92,'0,0,0 190,5,0 355,15,0 485,95,0 480,245,0 390,340,5 280,320,10 240,435,13 340,540,9 280,665,3 115,690,0 -20,625,0 -55,515,0 -150,465,0 -265,375,0 -230,225,0 -150,135,0 -40,150,0 45,105,0 -50,40,0'],
  '14': ['双丘三叉','双波峰测速','TRIDENT DUNES',0.84,'0,0,0 180,-10,0 365,10,0 500,90,0 505,230,0 430,280,0 360,365,0 420,460,5 550,485,11 625,585,7 550,690,2 405,680,0 300,565,0 245,460,0 145,495,0 30,620,0 -120,620,0 -230,500,0 -200,340,0 -100,260,0 -5,160,0 -100,65,0'],
  '15': ['极地三叶','三连发卡道具','POLAR TRILOBE',0.89,'0,0,0 175,-10,0 355,20,3 445,120,7 430,255,11 350,330,16 260,300,18 235,425,20 340,485,21 340,600,17 215,680,14 75,645,10 10,550,8 -85,615,6 -235,570,4 -290,415,3 -230,285,2 -110,275,1 -80,170,0 -155,65,0'],
  '16': ['悬崖王冠','王冠山岭决战','CLIFFSIDE CROWN',0.86,'0,0,0 185,-10,0 350,5,2 475,80,6 525,205,10 465,300,15 390,295,18 345,410,20 440,485,22 455,605,24 325,695,24 180,680,21 100,605,18 50,470,14 -60,510,12 -175,485,10 -270,360,8 -250,200,5 -145,105,3 -40,140,2 65,75,1'],
});
/** V3.8 technical rhythm: two-key-drivable S sectors inserted into 16
 * independent route blueprints. Values are [ORIGINAL segment, world-metres
 * lateral offset, side]. We keep the initial straight and existing whole-route
 * silhouettes; do not change laps, ranking, goals or vehicle physics.
 *
 * Each S contains a left-right (or right-left) commitment. These are actual
 * native spline vertices, not painted arrows or instantaneous steering.
 * Do not automatically widen/cut guardrails to make difficult turns free.
 */
export const COURSE_TECHNICAL_SECTORS=Object.freeze({
  '01':[[1,14,1],[7,14,-1]],
  '02':[[1,18,-1],[12,19,1]],
  '03':[[2,16,1],[10,16,-1]],
  '04':[[1,18,1],[11,19,-1]],
  '05':[[1,18,-1],[12,18,1]],
  '06':[[1,17,1],[18,19,-1],[21,17,1]],
  '07':[[1,16,-1],[12,16,1]],
  '08':[[1,17,-1],[16,17,1],[19,15,-1]],
  '09':[[3,16,1],[13,16,-1]],
  '10':[[1,18,1],[12,17,-1],[17,16,1]],
  '11':[[1,17,-1],[11,17,1],[16,16,-1]],
  '12':[[2,17,1],[12,18,-1],[15,17,1],[17,16,-1]],
  '13':[[1,18,1],[9,18,-1],[14,18,1]],
  '14':[[1,17,-1],[11,18,1],[15,17,-1]],
  '15':[[1,18,1],[10,17,-1],[14,17,1],[19,16,-1]],
  '16':[[1,18,-1],[9,17,1],[15,18,-1],[17,16,1]],
});
export function injectTechnicalSectors(local,courseId,scale) {
  const items=COURSE_TECHNICAL_SECTORS[courseId];
  if(!Array.isArray(items)||!Array.isArray(local)||
     !Number.isFinite(scale)||scale<=0)throw Error('Missing original technical section');
  const out=local.map(v=>v.slice()),seen=new Set();
  for(const [index,amplitude,side] of [...items].sort((a,b)=>b[0]-a[0])){
    if(!Number.isInteger(index)||index<=0||index>=local.length-1||
       !(amplitude>=12&&amplitude<=28)||![-1,1].includes(side)||
       seen.has(index))throw Error('Invalid or repeated technical sector '+courseId);
    seen.add(index);
    const a=local[index],b=local[index+1],
      dx=b[0]-a[0],dz=b[1]-a[1],norm=Math.hypot(dx,dz);
    if(norm*scale<112)throw Error('Technical sector too short for safe two-key steering '+courseId);
    const nx=-dz/norm,nz=dx/norm,offs=side*amplitude/scale;
    const first=[a[0]+dx*.31+nx*offs,a[1]+dz*.31+nz*offs,a[2]+(b[2]-a[2])*.31],
      second=[a[0]+dx*.69-nx*offs,a[1]+dz*.69-nz*offs,a[2]+(b[2]-a[2])*.69];
    out.splice(index+1,0,first,second);
  }
  return out;
}

export function careerCourseDetails(id) {
  const value=COURSE_BLUEPRINTS[id];return value && {
    title:value[0],feel:value[1],english:value[2],
    biome:CAREER_COURSE_MAPS[Number(id)-1],
  };
}
const parseLocalRoute = entry => entry.split(' ').map(part => part.split(',').map(Number));
export function createCareerLayouts(layouts) {
  const fingerprints=new Set(),titles=new Set();
  for(let i=1;i<=16;i++){
    const id=String(i).padStart(2,'0'),base=layouts[CAREER_COURSE_MAPS[i-1]],
      blueprint=COURSE_BLUEPRINTS[id];
    if(!base?.__racingV31||!blueprint||!Array.isArray(base.points))
      throw Error('V3.7 requires verified biome and independent course '+id);
    const [title,feel,english,scale,sketch]=blueprint;
    const local=injectTechnicalSectors(parseLocalRoute(sketch),id,scale);
    if(!Number.isFinite(scale)||scale<.6||scale>1.2||local.length<12||
       local.length>28||titles.has(title)||!english||!feel||
       local[0].some(n=>n!==0))
      throw Error('Invalid authored course blueprint '+id);
    titles.add(title);
    const [ox,oz]=base.points[0],desert=CAREER_COURSE_MAPS[i-1]==='egypt';
    const points=local.map(p=>{
      if(p.length!==3||!p.every(Number.isFinite)||p[2]<0||p[2]>25)
        throw Error('Non-finite or unsafe V3.7 course point '+id);
      return desert ?
        [ox-p[1]*scale,oz+p[0]*scale,p[2]] :
        [ox+p[0]*scale,oz+p[1]*scale,p[2]];
    });
    const signature=JSON.stringify(points);
    if(fingerprints.has(signature))throw Error('Duplicate authored course shape '+id);
    fingerprints.add(signature);
    layouts['race-'+id]={width:base.width,points};
  }
  if(fingerprints.size!==16||titles.size!==16)throw Error('Expected 16 distinct hand-authored courses');
  return fingerprints.size;
}


/**
 * Shift native speed pads and scenic tunnels to the ACTUAL career route.
 * The V3.5 world-coordinate pads were tied to one of the four old road shapes;
 * merely reusing them would make newer stages miss a pickup by hundreds of m.
 * Their number and lateral risk remain unchanged. No pad/goal is awarded here.
 */
export function createRaceTrackTheme(theme,track,course) {
  // The pinned game constructs one four-biome DEMO track before the mobile
  // career adaptor boots. Do not require a numbered course until race start.
  if(TRACK_RESHAPES[course])return theme;
  if(!COURSE_BLUEPRINTS[course?.slice(5)] ||
     !Number.isFinite(track?.length)||track.length<1200||
     typeof track.curvAhead!=='function')
    throw Error('Cannot place race decorations on unverified stage track');
  const original=theme?.boostPads??[];
  const isCity=original.length>2, bases=isCity?[.17,.39,.62,.84]:[.27,.67];
  const seekStraight=(fraction)=>{
    const target=track.length*fraction;
    let best=target,score=Infinity;
    for(let i=-13;i<=13;i++){
      const d=Math.max(110,Math.min(track.length-150,target+i*8));
      const c=Math.abs(track.curvAhead(d,58));
      const slope=Math.abs(track.slope[Math.floor(d/track.ds)%track.N]??0);
      const value=c*180+slope*.65+Math.abs(d-target)/1600;
      if(value<score){score=value;best=d;}
    }
    return best/track.length;
  };
  return {
    ...theme,
    boostPads:original.map((p,i)=>({
      f:seekStraight(bases[i]??Math.min(.9,.18+i*.19)),
      lat:p.lat??0,
    })),
    tunnels:(theme?.tunnels??[]).map((t,i)=>{
      const d=seekStraight(.46+i*.14);
      return {f0:d,f1:Math.min(.96,d+.032)};
    }),
  };
}


/**
 * Lightweight, course-specific WORLD landmarks (no proprietary models).
 * Each road receives a different combination of sculptural pylons and palette,
 * placed outside the guardrail at two memorable sectors. Visual-only:
 * neither collision, speed, score nor checkpoint logic is modified.
 */
const COURSE_ACCENTS = Object.freeze([
  0x33d8eb,0xffa33b,0x936dff,0x4ce0bd,
  0xffc65a,0xfa5f91,0x49b8ff,0x84ebff,
  0xeed067,0xee4edc,0x58e3c7,0xb4d8ff,
  0xf0bc55,0xff8f42,0x73d8ff,0xe4bcfa,
]);
export function buildRaceLandmarks(THREE,track,course) {
  const group=new THREE.Group();
  if(TRACK_RESHAPES[course])return group; // Pinned native pre-career demo.
  const n=Number(course?.slice(5));
  if(!Number.isInteger(n)||n<1||n>16||!track?.sample)
    throw Error('Course-specific world landmarks require a native track');
  group.name='unique-course-landmarks-'+course;
  const material=new THREE.MeshStandardMaterial({
    color:COURSE_ACCENTS[n-1],roughness:.46,metalness:.26,
    emissive:COURSE_ACCENTS[n-1],emissiveIntensity:.13,
  });
  const pale=new THREE.MeshStandardMaterial({
    color:0xf0f7fa,roughness:.79,metalness:.09,
  });
  const floorMat=new THREE.MeshStandardMaterial({color:0x283c51,roughness:.94});
  const share=(root,geo,mat,x,y,z)=>{
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);
    mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;
  };
  const shapes=[
    (root)=>{ // city tower
      share(root,new THREE.BoxGeometry(3.5,16,3.5),floorMat,0,8,0);
      share(root,new THREE.BoxGeometry(5,2,5),material,0,17,0);
    },
    (root)=>{ // desert obelisk
      share(root,new THREE.CylinderGeometry(1.2,2.4,17,4),material,0,8.5,0);
      share(root,new THREE.ConeGeometry(2.1,5,4),pale,0,19,0);
    },
    (root)=>{ // elevated torus beacon
      share(root,new THREE.CylinderGeometry(1.6,2,12,8),floorMat,0,6,0);
      const ring=share(root,new THREE.TorusGeometry(6,.7,7,16),material,0,15,0);
      ring.rotation.y=Math.PI/3;
    },
    (root)=>{ // coastal sail
      share(root,new THREE.CylinderGeometry(.55,.8,17,7),floorMat,0,8.5,0);
      const sail=share(root,new THREE.ConeGeometry(6.5,13,3),material,4.5,11,0);
      sail.rotation.z=.28;
    },
    (root)=>{ // heritage temple gate
      for(const x of [-3,3])share(root,new THREE.CylinderGeometry(1.4,1.7,15,7),floorMat,x,7.5,0);
      share(root,new THREE.BoxGeometry(10,3.5,3),material,0,17,0);
    },
    (root)=>{ // lightning staircase
      for(let i=0;i<3;i++)share(root,new THREE.BoxGeometry(4.5,3,4.5),i%2?material:pale,0,3+i*4,0);
    },
    (root)=>{ // sea-cliff rock
      share(root,new THREE.DodecahedronGeometry(8,0),floorMat,0,6,0);
      share(root,new THREE.ConeGeometry(3.2,9,5),material,0,14,0);
    },
    (root)=>{ // crystalline snow shrine
      share(root,new THREE.CylinderGeometry(1.2,2,9,5),floorMat,0,4.5,0);
      share(root,new THREE.OctahedronGeometry(7,0),material,0,15.5,0);
    },
  ];
  // A different signature pair in every numbered course.
  const types=[(n+7)%8,(n*5+2)%8],fractions=n%2?[.27,.72]:[.32,.77];
  for(let sector=0;sector<2;sector++){
    const sample=track.sample(track.length*fractions[sector],{});
    for(const side of [-1,1]){
      const root=new THREE.Group();
      root.name='course-landmark-'+course+'-'+sector+'-'+side;
      const offset=track.halfW+(sector?12:10);
      root.position.set(sample.x+sample.rx*side*offset,
        sample.y-1.5,sample.z+sample.rz*side*offset);
      // No track collision: every mesh lies beyond the side guardrail.
      shapes[types[sector]](root);
      group.add(root);
    }
  }
  return group;
}


/**
 * Distinct daylight/weather palettes per ORIGINAL course. Preserves the pinned
 * biome meshes and sunlight/shadow physics, only varies authored sky colours.
 * Together with varying prop RNG seed and 3D landmark pairs, the same biome
 * no longer looks identical on five different stage roads.
 */
const COURSE_SKIES = Object.freeze([
  ['#419ad3','#c7eafa','#c5e5ef'], // 01 clear city
  ['#5184c8','#f7d49f','#e5be87'], // 02 desert morning
  ['#3f528e','#eeadd5','#b990aa'], // 03 overpass at dusk
  ['#3494c2','#b5e9e2','#86c5d7'], // 04 coastal midday
  ['#b65e82','#fac995','#d79c7a'], // 05 orange temple sunset
  ['#305d79','#b2d7d2','#679cac'], // 06 blue-hour city
  ['#5e80b5','#f5c69c','#a7b8c5'], // 07 sea cliff golden hour
  ['#668cc6','#e8f6ff','#a7d7f0'], // 08 snow bright
  ['#a67558','#f5ddb1','#ceb18c'], // 09 desert haze
  ['#243b76','#cc9ee4','#5c78b7'], // 10 neon twilight
  ['#558aa3','#d3e7ea','#92c4ce'], // 11 coastal mist
  ['#5c759f','#d5efff','#93b7d4'], // 12 glacier cold
  ['#2c497c','#a4b9d9','#547b9e'], // 13 city late evening
  ['#866ec2','#f9bd96','#c39891'], // 14 dunes violet sunset
  ['#525b9b','#ccd6ff','#9cafe1'], // 15 polar dusk
  ['#37486e','#dfc5df','#9d9fb9'], // 16 cliff final hour
]);
export function createRaceSky(sky,course) {
  if(TRACK_RESHAPES[course])return sky; // native demo
  const n=Number(course?.slice(5));
  if(!Number.isInteger(n)||n<1||n>16||!sky)throw Error('Unknown stage sky');
  const [top,horizon,bottom]=COURSE_SKIES[n-1];
  return {...sky,top,horizon,bottom};
}

const same = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length === 3 && a.every((v,i)=>v===b[i]);
export function applyTrackDesign(layouts) {
  const report = {};
  for (const [key, plan] of Object.entries(TRACK_RESHAPES)) {
    const layout = layouts?.[key];
    if (!layout || !Array.isArray(layout.points)) throw Error('Missing pinned race layout: '+key);
    if (layout.__racingV31 === true) {report[key] = layout.points.length;continue;}
    if (layout.points.length !== plan.expected)
      throw Error(key+': upstream control-point count changed; refusing unverified geometry patch');
    const points = layout.points.map(p=>[...p]);
    for (const cut of plan.cuts) {
      if (!same(points[cut.start],cut.first) || !same(points[cut.end],cut.last))
        throw Error(key+': pinned control anchors changed; do not corrupt an unknown map');
      points.splice(cut.start,cut.end-cut.start+1,...cut.points.map(p=>[...p]));
    }
    layout.points = points;
    layout.width = plan.width;
    Object.defineProperty(layout,'__racingV31',{value:true,enumerable:false});
    report[key] = points.length;
  }
  createCareerLayouts(layouts);
  return report;
}
