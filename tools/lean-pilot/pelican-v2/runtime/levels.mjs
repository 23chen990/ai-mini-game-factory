/* global structuredClone */
export const LANES = [-1.7, 0, 1.7];
// Authored encounters, shared coast. Distances/timing/content are original to this project.
const definitions = [
 {id:1,name:'海岸出发',subtitle:'追鱼 · 学会轻点变道',distance:300,speed:7.5,seconds:55,goal:{count:6,gold:0},hour:14,weather:'clear',reward:15,rows:[[90,'pedestrian',0],[162,'pedestrian',2],[225,'barrier',1]]},
 {id:2,name:'行人出没',subtitle:'看清斑马线，留出时间',distance:420,speed:8,seconds:70,goal:{count:9,gold:1},hour:16,weather:'clear',reward:22,rows:[[76,'pedestrian',0],[134,'pedestrian',2],[192,'pedestrian',0],[246,'barrier',1],[298,'pedestrian',2],[356,'barrier',0]]},
 {id:3,name:'危险公路',subtitle:'汽车不能跳过，提前变道',distance:540,speed:8.8,seconds:82,goal:{count:12,gold:1},hour:15.5,weather:'clear',reward:30,rows:[[100,'car',1],[161,'pedestrian',0],[222,'van',2],[222,'barrier',1],[298,'car',0],[360,'barrier',2],[421,'van',1],[483,'car',2]]},
 {id:4,name:'雨中骑行',subtitle:'小雨海岸 · 连续观察',distance:630,speed:9.2,seconds:95,goal:{count:15,gold:2},hour:16.4,weather:'rain',reward:38,rows:[[100,'car',1],[162,'pedestrian',2],[225,'van',0],[225,'barrier',1],[294,'car',2],[350,'barrier',1],[410,'car',0],[410,'van',2],[478,'pedestrian',0],[536,'van',1],[593,'barrier',2]]},
 {id:5,name:'夜间赶海',subtitle:'暮色公路 · 最后的鱼篮',distance:720,speed:9.6,seconds:106,goal:{count:18,gold:2},hour:18.65,weather:'dusk',reward:50,rows:[[95,'car',1],[151,'pedestrian',0],[210,'van',2],[210,'barrier',1],[276,'car',0],[334,'barrier',2],[396,'van',1],[454,'pedestrian',2],[516,'car',0],[516,'van',1],[584,'barrier',0],[644,'car',2],[694,'pedestrian',0]]},
];
export const BOUNDS = {car:{x:1.5,z:.63},van:{x:1.8,z:.66},pedestrian:{x:.25,z:.25},barrier:{x:.24,z:.59}};
// Conservative envelopes include approach motion, player body and pedestrian crossing.
export function unsafeLanes(obstacles,x) {
 const bad=new Set();
 for(const o of obstacles){const behind=o.kind==='pedestrian'?20:10;const ahead=['car','van'].includes(o.kind)?24:8;
  if(x>=o.x-ahead&&x<=o.x+behind){if(o.kind==='pedestrian'){bad.add(0);bad.add(1);/* keep far right escape */}else bad.add(o.lane);}}
 return bad;
}
export const LEVELS=definitions.map(d=>{
 const obstacles=d.rows.map(([x,kind,lane],i)=>({id:`l${d.id}-o${i}`,x,kind,lane,speed:kind==='car'?1.7:kind==='van'?1.25:0}));
 const fish=[];let lastLane=1;
 for(let x=15,i=0;x<d.distance-10;x+=16,i++){
  const bad=unsafeLanes(obstacles,x);let lane=i<3?1:[1,1,2,2,1,0,0,1][Math.floor(i/2)%8];
  if(bad.has(lane))lane=[lastLane,1,2,0].find(l=>!bad.has(l))??2;
  lastLane=lane;fish.push({id:`l${d.id}-f${i}`,x,lane,golden:i>1&&i%7===3});
 }
 const {rows: _rows,...config}=d; void _rows;
 return Object.freeze({...config,fish,obstacles});
});
export function makeLevel(id) {const l=LEVELS.find(l=>l.id===id);if(!l)throw Error('Unknown level');return structuredClone(l);}
export function validateLevel(l) {
 const errors=[];if(l.fish.length<l.goal.count+4)errors.push('fish supply insufficient');
 for(const f of l.fish)if(unsafeLanes(l.obstacles,f.x).has(f.lane))errors.push('unsafe fish '+f.id);
 const groups=[];for(const o of [...l.obstacles].sort((a,b)=>a.x-b.x)){let g=groups.at(-1);if(!g||o.x-g.x>12){g={x:o.x,lanes:new Set()};groups.push(g);}if(o.kind!=='pedestrian')g.lanes.add(o.lane);}
 let reachable=new Set([0,1,2]),prev=0;
 for(const g of groups){const free=[0,1,2].filter(i=>!g.lanes.has(i));if(!free.length)errors.push('blocked all lanes at '+g.x);
  const next=new Set(free.filter(to=>[...reachable].some(from=>(g.x-prev)/l.speed>=.65+Math.abs(to-from)*.3)));
  if(!next.size)errors.push('blocked reaction path at '+g.x);reachable=next;prev=g.x;
 }
 return errors;
}
