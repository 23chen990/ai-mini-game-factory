/**
 * Tiny context hints, never an on-screen driving button.
 * A random item box is still random: prompt lane choice, not a fake item type.
 */
export function roadHint(game) {
  const p=game?.player, tr=game?.track;
  if (game?.state!=='race' || !p || !tr || p.finished || p.wrongWay>.65 || p.airborne || p.s<16) return '';
  if (game.itemMode && game.items?.boxes?.length && tr.length>0) {
    // Four original item rows sit at 10%, 35%, 60% and 85% of each lap.
    const current=((p.d%tr.length)+tr.length)%tr.length;
    for(const fraction of [.1,.35,.6,.85]) {
      const dd=(fraction*tr.length-current+tr.length)%tr.length;
      if(dd>=28 && dd<=95) return '🎁 前方道具：左右选择车道';
    }
  }
  const bend=tr.curvAhead?.(p.d+25,95) ?? 0;
  if(Math.abs(bend)<.014 || !Number.isFinite(bend))return '';
  return bend>0 ? '↶ 前方左急弯 · 提前转向' : '↷ 前方右急弯 · 提前转向';
}
