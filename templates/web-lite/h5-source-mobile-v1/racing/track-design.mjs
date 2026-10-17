import { shapeV9RhythmSegments, V9_WIDTH_BANDS } from './v9-course-director.mjs';
import { EXPANSION_COURSES } from './career-expansion.mjs';
import { applyV8CourseGeometry, V8_COURSES } from './v8-course-geometry.mjs';
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
export const CAREER_COURSE_MAPS = Object.freeze([
  ...'city egypt city aegean egypt city aegean snow egypt city aegean snow city egypt snow aegean'.split(' '),
  ...Object.values(EXPANSION_COURSES).map(c=>c.map),
]);
export const COURSE_BLUEPRINTS = Object.freeze({
  '01': ['新城攻防环','四段逆向弯·双圈前三','NEON CHALLENGE',1,'0,0,0 140,0,0 330,5,0 475,70,0 550,190,0 545,330,0 460,435,0 320,480,0 150,455,0 0,395,0 -85,280,0 -95,140,0'],
  '02': ['风蚀箭谷','高速跳台','DUNE SPRINT',1,'0,0,0 185,0,0 400,-10,0 565,15,7 650,120,13 660,270,4 610,360,1 490,370,0 420,300,0 370,205,0 290,200,0 230,300,0 120,420,0 -65,430,0 -195,345,0 -210,190,0 -145,70,0'],
  '03': ['风车立交','双层切线','OVERPASS PINWHEEL',1,'0,0,0 170,-10,0 330,5,0 475,105,2 490,220,7 405,315,11 325,300,7 235,260,2 195,350,0 245,470,0 120,550,0 -45,510,0 -145,380,0 -110,265,0 -5,235,0 55,175,0 -55,125,0 -120,35,0'],
  '04': ['海鸥湾','海崖连漂','GULLWING COAST',1,'0,0,0 170,-15,2 340,0,5 455,65,8 490,200,13 610,220,18 670,340,21 620,445,19 480,465,15 390,415,13 300,430,17 170,525,18 -5,500,14 -140,405,10 -165,275,7 -80,190,6 50,200,7 115,125,4 -15,85,2'],
  '05': ['失落神殿','马蹄峡谷近道','TEMPLE HORSESHOE',1,'0,0,0 175,-10,0 340,35,0 490,115,0 595,260,0 590,400,0 500,500,4 360,495,8 300,410,11 305,315,7 210,280,1 120,350,0 55,485,0 -100,470,0 -195,350,0 -200,175,0 -130,45,0'],
  '06': ['双城回廊','环区穿梭','TWIN DISTRICT',0.76,'0,0,0 185,-5,0 375,0,0 500,80,2 490,215,5 375,310,8 245,320,8 175,245,7 155,155,4 50,140,2 -30,215,0 -80,360,0 -15,480,0 130,530,0 255,505,0 345,435,0 410,480,0 420,615,0 270,695,0 60,670,0 -130,580,0 -235,415,0 -225,230,0 -130,80,0'],
  '07': ['海崖阶梯','断崖连续下坡','CLIFF STEPS',1,'0,0,0 170,0,1 350,0,3 485,50,5 530,140,8 470,225,13 370,245,17 260,230,20 220,315,22 315,400,23 415,420,22 460,510,20 325,580,17 160,570,14 80,475,13 0,390,11 -125,410,10 -230,340,8 -230,185,5 -140,65,2'],
  '08': ['雪岭Ω环','雪地双弧','SNOW OMEGA',0.7,'0,0,0 165,-5,0 335,10,2 470,100,7 525,230,11 475,350,15 335,410,17 205,355,14 155,255,11 65,220,8 -60,305,7 -60,460,9 65,570,11 230,595,9 380,585,7 500,520,5 600,405,3 625,240,1 545,65,0 410,-75,0 225,-100,0 35,-75,0 -100,-20,0'],
  '09': ['仙人掌岭','错峰补时','CACTUS RIDGE',0.86,'0,0,0 170,0,0 340,20,0 440,120,0 450,285,4 525,335,9 630,305,7 740,365,2 745,490,0 660,570,0 540,530,0 440,425,0 335,400,0 290,530,0 135,580,0 -10,510,0 -55,395,0 25,300,0 150,240,0 85,150,0 -45,85,0'],
  '10': ['霓虹闪电','折返捷径','NEON LIGHTNING',0.86,'0,0,0 190,0,0 370,30,0 495,120,0 440,210,0 320,240,0 265,340,0 330,445,0 490,510,0 535,630,0 420,715,0 250,700,0 105,640,0 -35,540,0 -55,420,0 65,355,0 140,275,0 45,175,0 -105,115,0 -100,10,0'],
  '11': ['海蛇湾','山腰长S弯','SERPENT BAY',0.91,'0,0,0 194.6,0,0.6 319.1,99.4,2.2 151.3,196,4.7 -40,194.6,7.9 -73.1,270.5,11.1 -153.9,434.6,14.2 -299.2,424.6,16.8 -304.3,249.5,18.4 -297.1,175.7,19 -479.4,183.6,18.4 -602.1,97.3,16.8 -443.8,12.8,14.3 -269,19.8,11.1 -251.6,-59.8,7.9 -178.3,-235,4.8 -29,-238.4,2.2 -9.9,-72.8,0.6'],
  '12': ['冰旋高架','错层冰桥近道','FROST SPIRAL',0.72,'0,0,0 160,-5,0 330,15,0 495,85,4 580,215,9 560,385,14 430,515,18 270,550,21 145,465,18 145,325,14 245,245,10 340,305,8 360,430,6 265,670,5 75,700,4 -95,600,3 -220,430,2 -225,240,1 -130,75,0'],
  '13': ['皇冠立交','技术近道车神','CROWN INTERCHANGE',0.92,'0,0,0 246.6,0,0.4 411.9,44.3,1.5 422.4,-11.1,3.2 464.9,-151.5,5.4 657.4,-208.5,7.6 849.5,-102.1,9.7 865.6,56.1,11.5 785,147.2,12.6 803.7,208.1,13 913.4,322.7,12.6 920.9,443.9,11.5 760.6,453.7,9.8 580.4,357.9,7.6 476.9,282.9,5.4 346.3,275.5,3.3 111.4,238.9,1.5 -69.7,114.2,0.4'],
  '14': ['双丘三叉','双波峰测速','TRIDENT DUNES',0.84,'0,0,0 180,-10,0 365,10,0 500,90,0 505,230,0 430,280,0 360,365,0 420,460,5 550,485,11 625,585,7 550,690,2 405,680,0 300,565,0 245,460,0 145,495,0 30,620,0 -120,620,0 -230,500,0 -200,340,0 -100,260,0 -5,160,0 -100,65,0'],
  '15': ['极地三叶','三连发卡道具','POLAR TRILOBE',0.89,'0,0,0 175,-10,0 355,20,3 445,120,7 430,255,11 350,330,16 260,300,18 235,425,20 340,485,21 340,600,17 215,680,14 75,645,10 10,550,8 -85,615,6 -235,570,4 -290,415,3 -230,285,2 -110,275,1 -80,170,0 -155,65,0'],
  '16': ['悬崖王冠','王冠山岭决战','CLIFFSIDE CROWN',0.86,'0,0,0 185,-10,0 350,5,2 475,80,6 525,205,10 465,300,15 390,295,18 345,410,20 440,485,22 455,605,24 325,695,24 180,680,21 100,605,18 50,470,14 -60,510,12 -175,485,10 -270,360,8 -250,200,5 -145,105,3 -40,140,2 65,75,1'],
  ...Object.fromEntries(Object.entries(EXPANSION_COURSES).map(([id,c])=>
    [id,[c.title,c.feel,c.english,c.scale,c.sketch]])),
});
/** V3.8 technical rhythm: two-key-drivable S sectors inserted into 30
 * independent route blueprints. Values are [ORIGINAL segment, world-metres
 * lateral offset, side]. We keep the initial straight and existing whole-route
 * silhouettes; do not change laps, ranking, goals or vehicle physics.
 *
 * Each S contains a left-right (or right-left) commitment. These are actual
 * native spline vertices, not painted arrows or instantaneous steering.
 * Do not automatically widen/cut guardrails to make difficult turns free.
 */
export const COURSE_TECHNICAL_SECTORS=Object.freeze({
  '01':[[1,21,-1],[5,19,1],[7,19,-1],[9,17,1]],
  '02':[[1,20,-1],[3,17,1],[12,21,1]],
  '03':[[2,21,1],[8,18,-1],[10,20,-1]],
  '04':[[1,20,1],[7,19,-1],[11,21,-1]],
  '05':[[1,18,-1],[12,18,1],[14,18,-1]],
  '06':[[1,17,1],[18,19,-1],[21,17,1]],
  '07':[[1,17,-1],[8,17,-1],[12,19,1],[17,17,-1]],
  '08':[[1,17,-1],[16,17,1],[19,15,-1]],
  '09':[[3,16,1],[13,16,-1]],
  '10':[[1,18,1],[12,17,-1],[17,16,1]],
  '11':[[2,16,-1],[5,15,1],[10,17,1],[14,16,-1]],
  '12':[[2,17,1],[12,18,-1],[15,17,1],[17,16,-1]],
  '13':[[5,17,1],[12,16,-1],[15,15,1]],
  '14':[[1,17,-1],[11,18,1],[15,17,-1]],
  '15':[[1,18,1],[9,16,-1],[10,17,-1],[14,17,1]],
  '16':[[1,18,-1],[9,17,1],[15,18,-1],[17,16,1]],
  ...Object.fromEntries(Object.entries(EXPANSION_COURSES).map(([id,c])=>[id,c.technical])),
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
/** Physical road width is part of the actual native Track collider.
 * All 16 roads demand real line control (including 01). An 18m minimum
 * provides physical recoverability, not an easy tutorial.
 * No invisible barriers, cosmetic width, or per-player adaptation. */
export const COURSE_ROAD_WIDTHS = Object.freeze({
  '10':18.5,
  '11':18,
  '12':18.5,
  '13':18.5,
  '14':18,
  '15':18,
  '16':18,
  ...Object.fromEntries(Object.entries(EXPANSION_COURSES).map(([id,c])=>[id,c.width])),
  '01':19,
  '02':18.5,
  '03':19,
  '04':19,
  '05':18,
  '06':19.5,
  '07':18,
  '08':19,
  '09':19,
});
export function createCareerLayouts(layouts, { v8 = false, v9 = false } = {}) {
  if(v9&&!v8)throw Error('V9 driving rhythms require native V8 3D geometry');
  const fingerprints=new Set(),titles=new Set();
  for(let i=1;i<=CAREER_COURSE_MAPS.length;i++){
    const id=String(i).padStart(2,'0'),base=layouts[CAREER_COURSE_MAPS[i-1]],
      blueprint=COURSE_BLUEPRINTS[id];
    if(!base?.__racingV31||!blueprint||!Array.isArray(base.points))
      throw Error('V3.7 requires verified biome and independent course '+id);
    const [title,feel,english,scale,sketch]=blueprint;
    const sourceRoute=parseLocalRoute(sketch);
    const local=v9
      ? shapeV9RhythmSegments(sourceRoute,id,scale,COURSE_TECHNICAL_SECTORS[id]).points
      : injectTechnicalSectors(sourceRoute,id,scale);
    const v8Geometry=v8 ? applyV8CourseGeometry(local,id,scale) : null;
    const authored=v8Geometry?.points ?? local;
    const planScale=v8Geometry?.scale ?? scale;
    if(!Number.isFinite(scale)||scale<.6||scale>1.2||local.length<12||
       local.length>40||titles.has(title)||!english||!feel||
       local[0].some(n=>n!==0))
      throw Error('Invalid authored course blueprint '+id);
    titles.add(title);
    const [ox,oz]=base.points[0],desert=CAREER_COURSE_MAPS[i-1]==='egypt';
    const points=authored.map(p=>{
      if(p.length!==3||!p.every(Number.isFinite)||p[2]<0||p[2]>(v8 ? 70 : 25))
        throw Error('Non-finite or unsafe V3.7 course point '+id);
      return desert ?
        [ox-p[1]*planScale,oz+p[0]*planScale,p[2]] :
        [ox+p[0]*planScale,oz+p[1]*planScale,p[2]];
    });
    const signature=JSON.stringify(points);
    if(fingerprints.has(signature))throw Error('Duplicate authored course shape '+id);
    fingerprints.add(signature);
    layouts['race-'+id]={width:COURSE_ROAD_WIDTHS[id]??base.width,points,
      ...(v9?{v9WidthProfile:V9_WIDTH_BANDS[id]}:{})};
  }
  if(fingerprints.size!==CAREER_COURSE_MAPS.length||titles.size!==CAREER_COURSE_MAPS.length)
    throw Error('Expected '+CAREER_COURSE_MAPS.length+' distinct hand-authored courses');
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
  const stageNumber=Number(course.slice(5));
  // The physical pad positions and reward lanes change by authored course.
  // Keep central desert jumps central. A left/right commitment must actually
  // intersect the real native boost-pad collider; no scripted rewards.
  const stagePad=(p,i)=>({
    f:seekStraight((bases[i]??Math.min(.9,.18+i*.19))+
      (((stageNumber*3+i*5)%7)-3)*.012),
    lat:(p.lat??0)*((stageNumber+i)%3===2?-1:1),
  });
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
  const paint='#'+COURSE_ACCENTS[stageNumber-1].toString(16).padStart(6,'0');
  return {
    ...theme,
    // Course-specific road-edge and boost-pad accents remain visible through
    // the entire physical lap, unlike a single different lobby illustration.
    curbA:paint,curbB:'#142034',boostColor:paint,
    boostPads:original.map(stagePad),
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
  ...Object.values(EXPANSION_COURSES).map(c=>c.accent),
]);
/** V4.2: large, readable WORLD features at real track stations.
 * These are non-colliding scenery, never fake road, reward, or rank data.
 * The start arch displays the actual physical course ID, so an older build
 * cannot pretend to have loaded a new circuit just by changing a lobby card.
 * Keep native Track/vehicle physics, legitimate shortcut paths and road mesh.
 */
function buildCourseIdentity(THREE, track, course, n) {
  const group = new THREE.Group();
  group.name = 'physical-course-identity-' + course;
  const color = COURSE_ACCENTS[n - 1], biome = CAREER_COURSE_MAPS[n - 1];
  const metal = new THREE.MeshStandardMaterial({color:0x14233a,roughness:.55,metalness:.5});
  const bright = new THREE.MeshBasicMaterial({color});
  const white = new THREE.MeshBasicMaterial({color:0xf2f8ff});
  const mesh = (parent, geometry, material, x, y, z) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  const sideDistance = track.halfW + 5.5;
  // Over-road arches are high above the actual vehicle and entirely visual.
  // The first sign is visible soon after GO; the second gives a mid-lap cue.
  for (const [index, fraction] of [.065, .52].entries()) {
    const sample = track.sample(track.length * fraction, {});
    const portal = new THREE.Group();
    portal.name = 'course-' + course + '-sector-arch-' + (index + 1);
    portal.position.set(sample.x, sample.y, sample.z);
    portal.rotation.y = sample.hd;
    for (const x of [-sideDistance,sideDistance]) {
      mesh(portal,new THREE.BoxGeometry(2,18,2),metal,x,9,0);
      mesh(portal,new THREE.BoxGeometry(2.6,3,2.6),bright,x,17.5,0);
    }
    mesh(portal,new THREE.BoxGeometry(sideDistance*2+3,2.3,2.1),metal,0,18,0);
    mesh(portal,new THREE.BoxGeometry(sideDistance*2+3,.5,2.4),bright,0,19.3,0);
    if (index === 0) {
      mesh(portal,new THREE.BoxGeometry(10,5.3,1.2),metal,0,23,0);
      const glyphs = ['abcdef','bc','abged','abgcd','fgbc','afgcd','afgecd','abc','abcdefg','abfgcd'];
      const seven = {
        a:[0,1.5,2.2,.38], b:[1.13,.78,.38,1.45],
        c:[1.13,-.78,.38,1.45], d:[0,-1.5,2.2,.38],
        e:[-1.13,-.78,.38,1.45], f:[-1.13,.78,.38,1.45],
        g:[0,0,2.2,.38]
      };
      for(const [place, digit] of String(n).padStart(2,'0').split('').entries()) {
        for(const segment of glyphs[Number(digit)]) {
          const [x,y,w,h] = seven[segment];
          mesh(portal,new THREE.BoxGeometry(w,h,.24),place===0?bright:white,
            x+(place===0?-2.15:2.15),y+23,-.73);
        }
      }
    }
    group.add(portal);
  }
  // Each numbered course uses its own roadside rhythm as well as a unique
  // spline, sky palette, and two signature arches. Reuse only 4 biome families.
  const stations = [.18,.34,.66,.86];
  for (const [index,fraction] of stations.entries()) {
    const sample = track.sample(track.length * fraction, {});
    const root = new THREE.Group();
    root.name = 'course-' + course + '-landscape-' + (index + 1);
    const side = (n + index) % 2 ? 1 : -1;
    const setback = track.halfW + 15 + (n % 3) * 3;
    root.position.set(sample.x + sample.rx * side * setback,
      sample.y - 1, sample.z + sample.rz * side * setback);
    const height = 19 + (n + index) % 3 * 6;
    if (biome === 'city') {
      mesh(root,new THREE.BoxGeometry(7,height,7),metal,0,height/2,0);
      mesh(root,new THREE.BoxGeometry(8,2,8),bright,0,height+1,0);
      mesh(root,new THREE.BoxGeometry(6,.65,8.6),bright,0,height*.58,0);
    } else if (biome === 'egypt') {
      mesh(root,new THREE.CylinderGeometry(1.1,3.8,height,4),metal,0,height/2,0);
      mesh(root,new THREE.ConeGeometry(3.5,6,4),bright,0,height+3,0);
      mesh(root,new THREE.BoxGeometry(9,1,9),bright,0,1,0);
    } else if (biome === 'aegean') {
      mesh(root,new THREE.CylinderGeometry(.8,1.7,height,8),metal,0,height/2,0);
      const sail = mesh(root,new THREE.ConeGeometry(7,height*.62,3),white,4,height*.67,0);
      sail.rotation.z = .22 + index*.09;
      mesh(root,new THREE.TorusGeometry(4.4,.55,6,14),bright,0,height+.3,0)
        .rotation.x = Math.PI/2;
    } else {
      mesh(root,new THREE.CylinderGeometry(1.1,2.5,height*.6,7),metal,0,height*.3,0);
      mesh(root,new THREE.OctahedronGeometry(7+(n%3),0),white,0,height*.75,0);
      mesh(root,new THREE.ConeGeometry(2.5,10,5),bright,0,height+3,0);
    }
    group.add(root);
  }
  return group;
}

/** Real roadside landforms anchored to V8 vertical road stations.
 * Stage-specific footprint and height; cheap low-poly, outside colliders.
 * No HUD pop-ups, source-game assets or fake surface/collision edits.
 */
export function buildV8CourseTerrain(THREE,track,course) {
  const group=new THREE.Group(),id=course?.slice(5),cfg=V8_COURSES[id];
  if(!cfg||!track?.sample||!Number.isFinite(track.length))return group;
  group.name='v8-landform-'+course;
  const n=Number(id),biome=CAREER_COURSE_MAPS[n-1];
  const colors={city:0x40576d,egypt:0xa97842,aegean:0x526c81,snow:0x81abc2};
  const base=new THREE.MeshStandardMaterial({color:colors[biome],roughness:.96});
  const accent=new THREE.MeshStandardMaterial({
    color:biome==='snow'?0xc8effb:biome==='egypt'?0xe8af61:0x79b3c2,
    roughness:.73,emissiveIntensity:.06});
  const shape=(root,geometry,material,x,y,z)=>{
    const obj=new THREE.Mesh(geometry,material);
    obj.position.set(x,y,z);root.add(obj);return obj;
  };
  const count=4+n%3;
  for(let i=0;i<count;i++){
    const f=.09+(i+.48)*( .82/count );
    const at=track.sample(track.length*f,{});
    const feature=new THREE.Group();feature.name='v8-landform-sector-'+course+'-'+i;
    const side=((n+i)%2)?1:-1;
    const offset=track.halfW+20+(n+i*7)%13;
    feature.position.set(at.x+at.rx*side*offset,at.y-7,
      at.z+at.rz*side*offset);
    const h=14+((n*3+i*5)%19)+Math.max(0,at.y*.12);
    if(biome==='city'){
      shape(feature,new THREE.BoxGeometry(5,h,5),base,0,h*.5,0);
      shape(feature,new THREE.BoxGeometry(8,1.2,8),accent,0,h+.8,0);
      if(i%2===0)shape(feature,new THREE.BoxGeometry(3,h*.5,3),base,9,h*.25,0);
    }else if(biome==='egypt'){
      shape(feature,new THREE.CylinderGeometry(3.5,9,h,5),base,0,h*.5,0);
      shape(feature,new THREE.ConeGeometry(5,9,5),accent,0,h+3,0);
      shape(feature,new THREE.BoxGeometry(18,2,8),base,-7,1,0);
    }else if(biome==='aegean'){
      shape(feature,new THREE.CylinderGeometry(6,10,h,6),base,0,h*.5,0);
      shape(feature,new THREE.DodecahedronGeometry(8,0),base,8,h*.6,0);
      shape(feature,new THREE.BoxGeometry(14,2,11),accent,1,h*.23,0);
    }else{
      shape(feature,new THREE.CylinderGeometry(2.5,6,h,6),base,0,h*.5,0);
      shape(feature,new THREE.OctahedronGeometry(5+(i%3),0),accent,1,h+.8,0);
      shape(feature,new THREE.BoxGeometry(12,2.2,7),accent,-6,1.3,0);
    }
    group.add(feature);
  }
  return group;
}

/**
 * V9 environment is paced to the ACTUAL road, not randomly scattered decor.
 * Terrain silhouettes respond to elevation/curvature and are grounded beyond
 * the collision corridor. Only 5 paired low-poly groups per loaded stage.
 * Complex tracks get retention cliffs; desert gets stone tiers, city gets
 * district gates, snow gets ridge shelves. All identity meshes are original.
 */
export function buildV9RoadsideSectors(THREE,track,course) {
  const root=new THREE.Group();root.name='v9-paced-roadside-'+course;
  if(!track?.__V9_WIDTH_PROFILE__||!Number.isFinite(track.length))return root;
  const id=Number(course.slice(5)),map=CAREER_COURSE_MAPS[id-1];
  const stone=map==='egypt'?0xa97e50:map==='snow'?0x8ab1c4:
    map==='aegean'?0x687782:0x4b6277;
  const light=map==='egypt'?0xebc592:map==='snow'?0xdaf5f4:
    map==='aegean'?0xd0b898:0xa2c5dc;
  const baseMat=new THREE.MeshStandardMaterial({color:stone,roughness:.95});
  const edgeMat=new THREE.MeshStandardMaterial({color:light,roughness:.82,metalness:.04});
  const rockGeo=new THREE.DodecahedronGeometry(1,0);
  const iceGeo=new THREE.OctahedronGeometry(1,0);
  const tierGeo=new THREE.BoxGeometry(1,1,1);
  for(let k=0;k<5;k++){
    const frac=.13+k*.18+((id+k)%3)*.018;
    const station=track.sample(track.length*frac,{});
    const width=track.v9WidthAt?.(station.d)??track.halfW;
    const turn=track.curv?.[station.i]??0;
    const steep=Math.abs(track.slope?.[station.i]??0);
    const h=11+(id+k*4)%13+Math.min(17,steep*120);
    for(const side of [-1,1]){
      const grp=new THREE.Group();
      grp.name='v9-terrain-'+course+'-'+k+'-'+side;
      const offset=width+16+((id+k*3)%7);
      grp.position.set(station.x+station.rx*side*offset,
        station.y-5,station.z+station.rz*side*offset);
      // Local Y placement is clamped near the true road surface, helping
      // players perceive downhill movement as landmarks step with elevation.
      const add=(geo,mat,x,y,z,sx,sy,sz)=>{
        const obj=new THREE.Mesh(geo,mat);
        obj.position.set(x,y,z);obj.scale.set(sx,sy,sz);
        obj.receiveShadow=true;grp.add(obj);
      };
      if(map==='city'){
        // Understated split districts, unlike repeated universal neon pillars.
        add(tierGeo,baseMat,0,h*.53,0,6,h,6);
        add(tierGeo,edgeMat,0,h+1.8,0,8,1.8,8);
        if(k%2===0)add(tierGeo,baseMat,9,h*.24,-4,4,h*.44,4);
      }else if(map==='egypt'){
        add(tierGeo,baseMat,0,3.5,0,16,7,10);
        add(rockGeo,baseMat,0,9,0,9,h*.38,8);
        add(tierGeo,edgeMat,-3,8,0,18,1.2,11);
      }else if(map==='snow'){
        add(tierGeo,baseMat,0,2.3,0,14,4.5,10);
        add(iceGeo,edgeMat,0,h*.55,0,5.5,h*.65,5);
        if(Math.abs(turn)>.008)add(iceGeo,baseMat,9,7,-3,3,8,3);
      }else{
        add(rockGeo,baseMat,0,h*.46,0,11,h*.6,9);
        add(tierGeo,baseMat,side*3,2.4,0,17,5,14);
        if(k%2===1)add(rockGeo,edgeMat,7,h*.82,1,5,h*.35,5);
      }
      root.add(grp);
    }
  }
  return root;
}

export function buildRaceLandmarks(THREE,track,course) {
  const group=new THREE.Group();
  if(TRACK_RESHAPES[course])return group; // Pinned native pre-career demo.
  const n=Number(course?.slice(5));
  if(!Number.isInteger(n)||n<1||n>CAREER_COURSE_MAPS.length||!track?.sample)
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
  group.add(buildCourseIdentity(THREE,track,course,n));
  group.add(buildV8CourseTerrain(THREE,track,course));
  if(track.__V9_WIDTH_PROFILE__)group.add(buildV9RoadsideSectors(THREE,track,course));
  if(n===7||n===22) {
    // A visible finish at the real one-way finish distance, not the loop seam.
    // No collider: native onLap handles the actual crossing and ranking.
    const at=track.sample(track.length*(n===7?.82:.84),{});
    const finish=new THREE.Group();finish.name='v8-single-run-finish-'+course;
    finish.position.set(at.x,at.y,at.z);
    finish.rotation.y=at.hd;
    const gold=new THREE.MeshBasicMaterial({color:0xffdd62});
    for(const side of [-1,1])
      share(finish,new THREE.BoxGeometry(1.8,8,1.8),gold,
        side*(track.halfW+2.8),4,0);
    share(finish,new THREE.BoxGeometry(track.halfW*2+7,1.7,2),gold,0,8,0);
    group.add(finish);
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
  ...Object.values(EXPANSION_COURSES).map(c=>c.sky),
]);
export function createRaceSky(sky,course) {
  if(TRACK_RESHAPES[course])return sky; // native demo
  const n=Number(course?.slice(5));
  if(!Number.isInteger(n)||n<1||n>CAREER_COURSE_MAPS.length||!sky)throw Error('Unknown stage sky');
  const [top,horizon,bottom]=COURSE_SKIES[n-1];
  return {...sky,top,horizon,bottom};
}

const same = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length === 3 && a.every((v,i)=>v===b[i]);
export function applyTrackDesign(layouts, { v8 = false, v9 = false } = {}) {
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
  createCareerLayouts(layouts,{v8,v9});
  return report;
}
