/**
 * V3.1 track rhythm pass. Pure data edits on the pinned four Catmull-Rom layouts.
 * No fork/junction, no engine rewrite, and bridge/tunnel anchor points are untouched.
 * Index ranges refer to the ORIGINAL pinned upstream layouts.js.
 */
export const TRACK_RESHAPES = Object.freeze({
  city: {
    expected: 29, width: 23,
    theme: '城市连续S弯 / 回头弯 / 出弯加速',
    cuts: [
      { start: 16, end: 18, first: [70,330,0], last: [-90,290,0],
        points: [[70,332,0],[16,324,0],[-20,330,0],[-90,292,0]] },
      { start: 1, end: 2, first: [-140,-152,0], last: [20,-150,0],
        points: [[-245,-164,0],[-194,-156,0],[-149,-141,0],[-92,-143,0],[-34,-166,0],[20,-150,0]] },
    ],
  },
  aegean: {
    expected: 24, width: 21,
    theme: '海湾入场左右切线 / 山坡连续发卡弯',
    cuts: [
      { start: 8, end: 11, first: [20,12,9], last: [10,118,12],
        points: [[13,7,9],[-66,36,10],[-66,96,11],[9,126,12]] },
      { start: 1, end: 2, first: [-60,-178,0], last: [110,-168,0],
        points: [[-181,-174,0],[-125,-157,0],[-63,-182,0],[1,-183,0],[70,-151,0],[110,-168,0]] },
    ],
  },
  egypt: {
    expected: 25, width: 23,
    theme: '沙丘加速带保留 / 北侧发卡 / 东侧连续弯',
    cuts: [
      { start: 15, end: 17, first: [300,150,0], last: [300,5,0],
        points: [[300,150,0],[266,124,0],[262,81,0],[300,5,0]] },
      { start: 7, end: 10, first: [-30,215,0], last: [-190,375,0],
        points: [[-39,216,0],[-138,222,0],[-214,290,0],[-191,375,0]] },
    ],
  },
  snow: {
    expected: 21, width: 22,
    theme: '雪岭入场连续S弯 / 保持8字高架上下分离',
    cuts: [
      { start: 16, end: 18, first: [-170,-60,0], last: [-340,-60,0],
        points: [[-172,-50,0],[-267,-18,0],[-340,-65,0]] },
      { start: 1, end: 2, first: [-40,-200,0], last: [110,-190,0],
        points: [[-143,-207,0],[-78,-211,0],[-24,-184,0],[42,-208,0],[110,-190,0]] },
    ],
  },
});
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
  return report;
}
