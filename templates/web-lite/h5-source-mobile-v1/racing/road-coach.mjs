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
  if(game.itemMode && game.items?.boxes?.length && (p.items?.length??0)<2) {
    // Pinned native boxes occupy four per-lap rows. Their item contents remain
    // RANDOM; the lane callout describes only a real, visible, available box.
    const row=[.1,.35,.6,.85].map(fraction=>({
      d:fraction*tr.length,
      ahead:(fraction*tr.length-current+tr.length)%tr.length,
    })).filter(candidate=>candidate.ahead>=28&&candidate.ahead<=115)
      .sort((a,b)=>a.ahead-b.ahead)[0];
    if(row) {
      const fallback='🎁 前方随机道具 · 左右选择车道';
      if(typeof tr.sample!=='function')return fallback;
      const sample=tr.sample(row.d,{});
      if(!Number.isFinite(sample.x)||!Number.isFinite(sample.z)||
         !Number.isFinite(sample.rx)||!Number.isFinite(sample.rz)||
         !Number.isFinite(sample.tx)||!Number.isFinite(sample.tz))return fallback;
      const physical=game.items.boxes.filter(box=>Number.isFinite(box.x)&&Number.isFinite(box.z));
      if(!physical.length)return fallback; // Minimal legacy fixtures only.
      const available=[];
      for(const box of physical) {
        if(box.respawn>0 || box.g?.visible===false)continue;
        const dx=box.x-sample.x,dz=box.z-sample.z;
        const along=dx*sample.tx+dz*sample.tz;
        const lat=dx*sample.rx+dz*sample.rz;
        if(Math.abs(along)<=8 && Number.isFinite(lat)&&Math.abs(lat)<=(tr.halfW??15)+1)
          available.push(lat);
      }
      if(!available.length)return ''; // All native boxes in this row are gone.
      const selected=available.sort((a,b)=>Math.abs(a-(p.lat??0))-Math.abs(b-(p.lat??0)))[0];
      if(selected>2.4)return '🎁 左侧可拾取随机道具 · 提前选线';
      if(selected< -2.4)return '🎁 右侧可拾取随机道具 · 提前选线';
      return '🎁 中线可拾取随机道具';
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
