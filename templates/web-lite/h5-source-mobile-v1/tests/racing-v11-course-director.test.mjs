/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { V11_COURSES, roundV11Course, createV11CourseGeometry, v11RaceFraction } from '../racing/v11-course-director.mjs';
import { createCareerLayouts, applyTrackDesign } from '../racing/track-design.mjs';

const ids = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0'));
const hash = text => createHash('sha256').update(text).digest('hex');
const portableHash = value => hash(JSON.stringify(value, (_key, item) => typeof item === 'number' ? +item.toFixed(6) : item));
const seed = () => Object.fromEntries(['city', 'egypt', 'aegean', 'snow'].map(name =>
  [name, { __racingV31: true, width: 22, points: [[31, -79, 0]] }]));

/**
 * Golden data below was obtained by evaluating the original V11 inline bundle,
 * independently of the restored source under test.
 * Artifact: racing-v11-playtest.html
 * SHA-256: 542239a88d814b433f9c840b892f9a361a2a00cffa25cefd8d7d2940544f61b6.
 * All 30 recovered outputs were also compared exactly with that original bundle
 * during recovery. This portable test rounds floating measurements to 1e-6 m.
 */
test('restored V11 route catalog exactly preserves all 30 original bundle designs', () => {
  assert.equal(hash(JSON.stringify(V11_COURSES)),
    '2ef027b102346edc25cab45e36f37739b761ee0e18d83cee7f0914e1525ed1fb');
  assert.deepEqual(Object.keys(V11_COURSES).sort(), ids);
});

test('restored geometry preserves original road controls, elevation, width profiles and identity', () => {
  const geometry = ids.map(id => [id, createV11CourseGeometry(id)]);
  const portable = JSON.stringify(geometry, (_key, value) => typeof value === 'number' ? +value.toFixed(6) : value);
  assert.equal(hash(portable), 'b262d9d024fad7f8c8293d00577a565824124cdd07220a16930895c9bca284a7');
  const plans = new Set();
  for (const [id, course] of geometry) {
    assert.ok(course.perimeterM > 3000 && course.perimeterM < 5100, id);
    assert.ok(course.maxGrade < .16, id);
    assert.ok(course.points.length >= 64 && course.points.length <= 105, id);
    assert.deepEqual(course.planPoints[0], [0, 0, 0], id);
    assert.equal(course.points.length, course.planPoints.length, id);
    assert.ok(course.points.some(point => point[2] > 10), id);
    plans.add(JSON.stringify(course.planPoints));
  }
  assert.equal(plans.size, 30);
});

test('course consumers cannot mutate cached geometry used by another race or preview', () => {
  const first = createV11CourseGeometry('07'), baseline = structuredClone(first);
  first.points[0][0] = 99999;
  first.planPoints[0][1] = 99999;
  first.widthProfile[0].factor = 99;
  assert.deepEqual(createV11CourseGeometry('07'), baseline);
});

test('point-to-point presentation excludes the return connector on stages 07 and 22', () => {
  assert.equal(v11RaceFraction('07'), .82);
  assert.equal(v11RaceFraction('race-07'), .82);
  assert.equal(v11RaceFraction('22'), .84);
  assert.equal(v11RaceFraction('race-22'), .84);
  assert.equal(v11RaceFraction('01'), 1);
  assert.equal(v11RaceFraction('30'), 1);
  assert.equal(v11RaceFraction(null), 1);
});

test('native V11 layout adapter matches the original bundle without duplicate shaping or scaling', () => {
  const layouts = seed();
  assert.equal(createCareerLayouts(layouts, { v8: true, v9: true, v10: true, v11: true }), 30);
  assert.equal(portableHash(layouts), '9f11aa9387b0d3e71e9d52138a57e195df0757a69018674a97b11bd9351474ae');
  const viaBuildEntry = seed();
  applyTrackDesign(viaBuildEntry, { v8: true, v9: true, v10: true, v11: true });
  assert.deepEqual(viaBuildEntry, layouts);
});

test('V11 requires integrated support while explicit V9 updates and the c099 V10 baseline remain separate', () => {
  assert.throws(() => createCareerLayouts(seed(), { v11: true }), /V11 routes require/);
  const v9 = seed(), v10 = seed();
  createCareerLayouts(v9, { v8: true, v9: true });
  createCareerLayouts(v10, { v8: true, v9: true, v10: true });
  assert.equal(Object.keys(v9).filter(id=>id.startsWith('race-')).length,30);
  assert.ok(ids.every(id=>!v9['race-'+id].v11CourseIdentity&&!v10['race-'+id].v11CourseIdentity));
  assert.notDeepEqual(v9['race-07'].points,v10['race-07'].points);
  // Independently evaluated from c099cfa17's original V9, V10 and track-design
  // modules. Newer V9 pacing/5-point beats cannot shift legacy V10 anchors.
  assert.equal(portableHash(v10), 'e3645425f2a323cfa655607145f8534c0b28105f7aa2055e49abdde4f796d481');
});

test('invalid road geometry fails explicitly before entering the native renderer', () => {
  assert.throws(() => createV11CourseGeometry('31'), /Unknown V11 course/);
  assert.throws(() => roundV11Course([[0, 0], [100, 100], [0, 100], [100, 0]], 30), /intersects/);
  assert.throws(() => roundV11Course([[0, 0], [10, 0], [100, 100], [-100, 100]], 30), /spacing/);
  assert.throws(() => roundV11Course([[0, 0], [100, 0], [100, 100], [0, 100]], 10), /Invalid V11 course/);
  assert.throws(() => roundV11Course([[0, 0], [100, 0], [100, 100], [0, 100]], 30), /start must lie on a straight/);
});
