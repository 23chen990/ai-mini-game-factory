/** Signed, native-geometry driving hints for an actual steering-only racer. */
export function roadHint(game) {
  const p=game?.player,tr=game?.track;
  if(game?.state!=='race' || !p || !tr || p.finished || p.wrongWay>.65 ||
     p.airborne || p.s<16 || !Number.isFinite(p.d) ||
     !Number.isFinite(tr.length) || tr.length<=0)return '';
  const current=((p.d%tr.length)+tr.length)%tr.length;
  const curve=(offset,range)=>{
    const value=tr.curvAhead?.(p.d+offset,range)??0;
    return Number.isFinite(value)?value:0;
  };
  const near=curve(12,48),later=curve(65,55);
  const direction=value=>value>0?'↶ 前方左急弯 · 提前转向':'↷ 前方右急弯 · 提前转向';
  // Never obscure an imminent dangerous bend with a random box or optional pad.
  if(p.s>=29 && Math.abs(near)>=.023)return direction(near);
  if(p.s>=26 && Math.abs(near)>=.012 && Math.abs(later)>=.012 &&
     Math.sign(near)!==Math.sign(later)) {
    if(game.map?.id==='city')return '↶↷ 城市连续S弯 · 短按换向';
    if(game.map?.id==='aegean')return '↶↷ 海湾连续弯 · 提前回正';
    return '↶↷ 连续弯 · 左右提前换向';
  }
  if(game.itemMode && game.items?.boxes?.length) {
    // Native box rows are at these per-lap fractions; contents are RANDOM.
    for(const fraction of [.1,.35,.6,.85]) {
      const ahead=(fraction*tr.length-current+tr.length)%tr.length;
      if(ahead>=28 && ahead<=115)return '🎁 前方随机道具 · 左右选择车道';
    }
  }
  if(tr.boostPads?.length) {
    let closest=null;
    for(const pad of tr.boostPads) {
      if(!Number.isFinite(pad.d) || !Number.isFinite(pad.lat))continue;
      const ahead=(pad.d-current+tr.length)%tr.length;
      if(ahead>=25 && ahead<=115 && (!closest || ahead<closest.distance))
        closest={distance:ahead,lat:pad.lat};
    }
    if(closest && Math.abs(closest.lat)>=3)
      return closest.lat>0?'⚡ 左侧有加速带 · 提前选线':'⚡ 右侧有加速带 · 提前选线';
  }
  if(game.map?.id==='egypt' && tr.vcurv && typeof tr.sample==='function') {
    const sample=tr.sample(p.d+65,{});
    if(sample && Number.isInteger(sample.i) && Number.isFinite(tr.vcurv[sample.i]) &&
       tr.vcurv[sample.i]<-.021 && p.s>29)return '⛰ 沙漠跳台 · 松手回正稳住落点';
  }
  if(game.map?.id==='snow' && tr.bridge && typeof tr.sample==='function') {
    const now=tr.sample(p.d,{}),future=tr.sample(p.d+65,{});
    if(now && future && tr.bridge[future.i] && !tr.bridge[now.i])
      return '❄ 雪岭高架 · 先稳住中线';
  }
  const bend=curve(25,95);
  return Math.abs(bend)>=.014?direction(bend):'';
}
