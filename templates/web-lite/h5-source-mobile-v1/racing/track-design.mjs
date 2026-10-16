/**
 * V3.3 track rhythm pass (retains V3.1 adapter marker for compatibility). Pure data edits on the pinned four Catmull-Rom layouts.
 * No fork/junction, no engine rewrite, and bridge/tunnel anchor points are untouched.
 * Index ranges refer to the ORIGINAL pinned upstream layouts.js.
 */
export const TRACK_RESHAPES = Object.freeze({
  city: {
    expected: 29, width: 23,
    theme: '城市直道节奏变线 / 东侧预警弯 / 上环连续S',
    cuts: [
      { start: 16, end: 18, first: [70,330,0], last: [-90,290,0],
        points: [[70,332,0],[16,324,0],[-20,330,0],[-90,292,0]] },
      { start: 8, end: 10, first: [215,110,2], last: [360,190,0],
        points: [[215,110,2],[245,148,1],[290,165,0],[360,190,0]] },
      { start: 1, end: 2, first: [-140,-152,0], last: [20,-150,0],
        points: [[-245,-164,0],[-180,-152,0],[-140,-152,0],
          [-100,-102,0],[-40,-105,0],[20,-150,0]] },
    ],
  },
  aegean: {
    expected: 24, width: 21,
    theme: '海湾低地奖励选线 / 高架山坡连续弯 / 坡顶双向弧',
    cuts: [
      { start: 17, end: 19, first: [80,318,17], last: [-180,250,12],
        points: [[80,318,17],[10,292,17],[-55,317,16],
          [-115,275,14],[-180,250,12]] },
      { start: 8, end: 11, first: [20,12,9], last: [10,118,12],
        points: [[13,7,9],[-66,36,10],[-66,96,11],[9,126,12]] },
      { start: 1, end: 2, first: [-60,-178,0], last: [110,-168,0],
        points: [[-181,-174,0],[-120,-155,0],[-60,-178,0],[-15,-167,0],
          [32,-135,0],[70,-145,0],[110,-168,0]] },
    ],
  },
  egypt: {
    expected: 25, width: 22,
    theme: '沙丘飞跃 / 北侧起伏S弯 / 东侧压弯回切 / 沙丘高差',
    cuts: [
      // Original far-eastern long straight now needs a right-left rhythm.
      // Retain both endpoints and keep generous separation from other roads.
      { start: 18, end: 21, first: [345,-70,0], last: [160,-320,0],
        points: [[345,-70,0],[330,-130,0],[275,-167,1.5],
          [293,-216,2.8],[225,-252,1.2],[160,-320,0]] },
      { start: 15, end: 17, first: [300,150,0], last: [300,5,0],
        points: [[300,150,0],[266,124,0],[262,81,0],[300,5,0]] },
      // A meaningful top-of-loop S bend instead of one long shallow arc.
      // Do not touch the temple tunnel or the original takeoff heights.
      { start: 11, end: 13, first: [-70,400,0], last: [190,330,0],
        points: [[-70,400,0],[-8,359,1.6],[65,388,3],
          [125,333,1.4],[190,330,0]] },
      { start: 7, end: 10, first: [-30,215,0], last: [-190,375,0],
        points: [[-39,216,0],[-128,217,0],[-223,286,0],[-191,375,0]] },
    ],
  },
  snow: {
    expected: 21, width: 22,
    theme: '雪岭双弧上环 / 8字高架错层 / 底部两次换向',
    cuts: [
      { start: 16, end: 18, first: [-170,-60,0], last: [-340,-60,0],
        points: [[-172,-50,0],[-267,-18,0],[-340,-65,0]] },
      { start: 8, end: 11, first: [-60,200,8], last: [170,230,0],
        points: [[-60,200,8],[-67,250,6],[-10,300,4],
          [90,293,2],[170,230,0]] },
      { start: 1, end: 2, first: [-40,-200,0], last: [110,-190,0],
        points: [[-143,-207,0],[-80,-211,0],[-24,-178,0],
          [42,-208,0],[110,-190,0]] },
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
