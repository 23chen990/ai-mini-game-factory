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

/** V3.6: sixteen unique physical centreline configurations using four scene biomes.
 * The 12 non-base courses have distinctive edited vertices; this is not yet a
 * fork/junction graph or sixteen independent art environments.
 * Edits are [V3.5 point index, x, z, y]; all start lines and protected anchors
 * remain unchanged. The native Track generates real road meshes from these.
 */
export const CAREER_COURSE_MAPS = Object.freeze(
  'city egypt city aegean egypt city aegean snow egypt city aegean snow city egypt snow aegean'.split(' '));
export const CAREER_ROUTE_EDITS = Object.freeze({
  '03': [[17,423,254,0],[18,371,340,0],[19,293,360,0],[20,220,290,0],[21,148,279,0]],
  '05': [[9,-133,185,0],[10,-252,274,0],[11,-213,407,0],[12,-81,412,0]],
  '06': [[7,127,-154,0],[8,173,-80,2],[9,229,-39,6],[10,193,9,8],[11,212,43,5]],
  '07': [[20,251,118,17],[21,313,175,18],[22,345,243,22],[23,275,325,23],[24,199,318,18]],
  '09': [[22,353,-64,0],[23,370,-142,0],[24,313,-187,2],[25,327,-238,4],[26,235,-260,2],[27,155,-317,0]],
  '10': [[12,220,117,3],[13,246,136,1],[14,265,189,0],[15,300,145,0],[16,374,185,0],[17,433,257,0]],
  '11': [[14,20,17,10],[15,-45,-14,12],[16,-98,30,14],[17,-81,108,14],[18,0,147,15]],
  '12': [[7,235,-70,4],[8,183,16,10],[9,103,41,16],[10,35,96,19],[11,-29,125,13]],
  '13': [[18,391,352,0],[19,299,383,0],[20,223,333,0],[21,142,269,0],[22,67,348,0],[23,18,308,0],[24,-21,361,0]],
  '14': [[12,-73,406,0],[13,-10,397,2],[14,70,407,4],[15,149,355,1],[16,194,327,0],[17,296,260,0]],
  '15': [[12,-66,207,8],[13,-107,274,9],[14,-54,347,12],[15,38,337,14],[16,101,325,10],[17,155,284,5],[18,175,232,0]],
  '16': [[25,82,314,17],[26,19,279,22],[27,-32,355,24],[28,-100,266,17],[29,-181,259,12],[30,-283,179,9]],
});

export function createCareerLayouts(layouts) {
  const fingerprints = new Set();
  for (let number = 1; number <= 16; number++) {
    const id = String(number).padStart(2, '0');
    const map = CAREER_COURSE_MAPS[number - 1];
    const baseline = layouts[map];
    if (!baseline?.__racingV31 || !Array.isArray(baseline.points))
      throw Error('V3.6 requires pinned V3.5 track for stage ' + id);
    const points = baseline.points.map(point => [...point]);
    for (const [index, x, z, height] of CAREER_ROUTE_EDITS[id] ?? []) {
      if (!Number.isInteger(index) || index <= 0 || index >= points.length ||
          ![x,z,height].every(Number.isFinite) || height < 0 || height > 25)
        throw Error('Invalid original career track vertex ' + id + ':' + index);
      points[index] = [x, z, height];
    }
    const signature = JSON.stringify(points);
    if (fingerprints.has(signature)) throw Error('Duplicate career track ' + id);
    fingerprints.add(signature);
    layouts['race-' + id] = { width: baseline.width, points };
  }
  return fingerprints.size;
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
