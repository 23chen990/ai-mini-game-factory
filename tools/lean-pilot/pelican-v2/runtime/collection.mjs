// Local-only cosmetic economy; no paid currency, fake ad rewards or server claims.
export const COAST_STYLES=Object.freeze([
 Object.freeze({id:'classic',name:'原味头盔',cost:0,color:'#ffffff',icon:'🪶'}),
 Object.freeze({id:'sunset',name:'日落橘',cost:45,color:'#ffd09c',icon:'🌅'}),
 Object.freeze({id:'lagoon',name:'海湾蓝',cost:75,color:'#78dbf6',icon:'🌊'}),
 Object.freeze({id:'mint',name:'薄荷绿',cost:95,color:'#a4f9c4',icon:'🍃'}),
 Object.freeze({id:'violet',name:'暮光紫',cost:120,color:'#c8a2fc',icon:'🌙'}),
 Object.freeze({id:'gold',name:'金鱼冠军',cost:180,color:'#ffe27a',icon:'🏆'}),
]);
const maximum=9999999;
const finiteInt=n=>Number.isSafeInteger(n)&&n>=0&&n<=maximum;
export function newCollection(){return {version:1,coins:0,owned:['classic'],equipped:'classic',
 bestDistance:0,careerRuns:0,endlessRuns:0,earnedTotal:0,spentTotal:0};}
export function loadCollection(raw){
 try{
  if(typeof raw!=='string'||raw.length>3000)return null;
  const data=JSON.parse(raw);
  if(!data||data.version!==1||!['coins','bestDistance','careerRuns','endlessRuns','earnedTotal','spentTotal'].every(k=>finiteInt(data[k])))return null;
  if(!Array.isArray(data.owned)||data.owned.length>COAST_STYLES.length)return null;
  const valid=new Set(COAST_STYLES.map(s=>s.id));
  if(data.owned.some(id=>!valid.has(id)))return null;
  const owned=[...new Set(['classic',...data.owned])];
  const equipped=owned.includes(data.equipped)?data.equipped:'classic';
  return {...data,owned,equipped};
 }catch{return null;}
}
export function styleById(id){return COAST_STYLES.find(s=>s.id===id)??COAST_STYLES[0];}
export function buyOrEquip(collection,id){
 const style=COAST_STYLES.find(item=>item.id===id);
 if(!style)return {ok:false,reason:'unknown'};
 if(collection.owned.includes(style.id)){
  collection.equipped=style.id;
  return {ok:true,action:'equipped',style};
 }
 if(collection.coins<style.cost)return {ok:false,reason:'insufficient',missing:style.cost-collection.coins};
 collection.coins-=style.cost;
 collection.spentTotal=Math.min(maximum,collection.spentTotal+style.cost);
 collection.owned.push(style.id);collection.equipped=style.id;
 return {ok:true,action:'purchased',style};
}
export function earnedCoastCoins(run){
 if(!run?.settled||!Number.isFinite(run.distance)||run.distance<1)return 0;
 // A genuine long ride earns more than intentionally colliding at the start.
 return Math.min(200,Math.max(0,Math.floor((run.count||0)/2)+Math.floor((run.gold||0)*2)+Math.floor(run.distance/140)));
}
export function collectCoastResult(collection,run){
 if(!run?.settled||run?.collectionCredited)return 0;
 const earned=earnedCoastCoins(run);
 run.collectionCredited=true;
 collection.coins=Math.min(maximum,collection.coins+earned);
 collection.earnedTotal=Math.min(maximum,collection.earnedTotal+earned);
 if(run.level?.endless){
  collection.endlessRuns=Math.min(maximum,collection.endlessRuns+1);
  collection.bestDistance=Math.max(collection.bestDistance,Math.min(maximum,Math.floor(run.distance)));
 }else collection.careerRuns=Math.min(maximum,collection.careerRuns+1);
 return earned;
}
