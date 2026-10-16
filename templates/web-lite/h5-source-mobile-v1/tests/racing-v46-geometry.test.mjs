import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_BLUEPRINTS, COURSE_TECHNICAL_SECTORS, COURSE_ROAD_WIDTHS,
  createCareerLayouts } from '../racing/track-design.mjs';

// The maps should require actual road steering and line choice, not just
// different scenery, extra laps or decorative sector arches.
const plans = {
  '10': { width: 19.5, sectors: 3 },
  '11': { width: 18, sectors: 4 },
  '12': { width: 19, sectors: 4 },
  '13': { width: 19, sectors: 3 },
  '14': { width: 18.5, sectors: 3 },
  '15': { width: 18.5, sectors: 4 },
  '16': { width: 18, sectors: 4 },
  '02': { width: 20, sectors: 3 },
  '05': { width: 18.5, sectors: 3 },
  '06': { width: 21, sectors: 3 },
  '07': { width: 19.5, sectors: 4 },
  '08': { width: 20.5, sectors: 3 },
  '09': { width: 20, sectors: 2 },
};
const mockLayouts = () => Object.fromEntries(
  [['city',23],['aegean',21],['egypt',22],['snow',22]].map(([biome,width]) => [
    biome,{__racingV31:true,width,points:[[0,0,0]]},
  ])
);
test('career technical roads use true physical collider widths on the original spline', () => {
  const layouts = mockLayouts();
  assert.equal(createCareerLayouts(layouts),16);
  for (const [id, spec] of Object.entries(plans)) {
    const blueprint = COURSE_BLUEPRINTS[id], layout = layouts['race-'+id];
    const plainPoints = blueprint[4].trim().split(/\s+/).length;
    assert.equal(COURSE_ROAD_WIDTHS[id],spec.width,'road width '+id);
    assert.equal(layout.width,spec.width,'native road collider width '+id);
    assert.equal(COURSE_TECHNICAL_SECTORS[id].length,spec.sectors,'actual switchback count '+id);
    assert.equal(layout.points.length,plainPoints+spec.sectors*2,'native centerline topology '+id);
    assert.ok(layout.points.every(p=>p.length===3&&p.every(Number.isFinite)));
  }
});
test('no excessive sudden difficulty jump in tutorial road, and physical courses stay distinct', () => {
  const layouts = mockLayouts();createCareerLayouts(layouts);
  assert.equal(layouts['race-01'].width,23,'first race remains a forgiving learning loop');
  assert.equal(layouts['race-03'].width,23,'early overtaking race stays teachable');
  assert.equal(layouts['race-04'].width,21,'early drift race stays teachable');
  const signatures=new Set();
  for(let i=1;i<=16;i++) {
    const id=String(i).padStart(2,'0'),course=layouts['race-'+id];
    assert.ok(course.width>=18,'keep every challenge road at least 18m wide');
    signatures.add(JSON.stringify(course.points));
  }
  assert.equal(signatures.size,16);
});
