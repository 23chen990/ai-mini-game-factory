export const DEFAULT_CAR_ID = 'starter';
// Appearance and entitlement metadata only. Every model uses the same native
// vehicle physics; custom GLBs keep their supplied materials and saved paint.
export const CAR_MODELS = Object.freeze([
 Object.freeze({ id: DEFAULT_CAR_ID, name: '初始赛车', native: true, free: true, paintable: true }),
 ...['银紫超跑','荧光跑车','黄金方程式','赤焰超跑','蓝白拉力'].map((name,index)=>{
  const number=String(index+1).padStart(2,'0');
  return Object.freeze({id:'custom-'+number,name,native:false,free:false,paintable:false});
 }),
]);
export const PAINT_NAMES = Object.freeze(['烈焰红','冰蓝','紫电','黄金','珍珠白','樱粉','翡翠','暗夜']);
export const LEGACY_PAINT_STARS = Object.freeze([0,3,6,10,14,19,25,34]);
const validPaint=i=>Number.isInteger(i)&&i>=0&&i<PAINT_NAMES.length;
const registeredCar=id=>typeof id==='string'&&CAR_MODELS.some(car=>car.id===id);
const unique=values=>[...new Set(values)];
export const freshCosmetics=()=>({ownedSkins:[0],ownedCars:[DEFAULT_CAR_ID],car:DEFAULT_CAR_ID});
export function restoreCosmetics(saved,earnedStars=0) {
 const valid=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
 const legacy=!Object.hasOwn(valid,'ownedSkins');
 const paints=legacy?LEGACY_PAINT_STARS.flatMap((n,i)=>earnedStars>=n?[i]:[]):Array.isArray(valid.ownedSkins)?valid.ownedSkins.filter(validPaint):[];
 const ownedSkins=unique([0,...paints]).sort((a,b)=>a-b);
 const ownedCars=unique([DEFAULT_CAR_ID,...(Array.isArray(valid.ownedCars)?valid.ownedCars.filter(registeredCar):[])]);
 return {ownedSkins,ownedCars,car:ownedCars.includes(valid.car)?valid.car:DEFAULT_CAR_ID};
}
export const skinOwned=(p,i)=>validPaint(i)&&(i===0||Array.isArray(p?.ownedSkins)&&p.ownedSkins.includes(i));
export const carOwned=(p,id)=>registeredCar(id)&&(id===DEFAULT_CAR_ID||Array.isArray(p?.ownedCars)&&p.ownedCars.includes(id));
export function grantCosmetic(p,kind,id) {
 if(kind==='skin'&&validPaint(id)&&id!==0&&!skinOwned(p,id))
  return {...p,ownedSkins:unique([0,...(p.ownedSkins??[]),id]).sort((a,b)=>a-b)};
 if(kind==='car'&&registeredCar(id)&&id!==DEFAULT_CAR_ID&&!carOwned(p,id))
  return {...p,ownedCars:unique([DEFAULT_CAR_ID,...(p.ownedCars??[]),id])};
 return null;
}
