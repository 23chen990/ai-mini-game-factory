import { expect, it } from 'vitest';
import { temporalWindows } from '../../src/qa/temporal-observations.js';
it('selects bounded chronological samples around early action, middle motion and terminal controls without naming a defect', () => {
 const windows = temporalWindows(25_520);
 expect(windows).toHaveLength(3);
 expect(windows.flat()).toHaveLength(18);
 expect(windows.flat()).toEqual([...windows.flat()].sort((a,b)=>a-b));
 expect(windows.flat().every(time => time >= 0 && time < 25_520)).toBe(true);
});
it('keeps short recordings strictly chronological without repeated clamped seek times', () => {
 const frames=temporalWindows(2_000).flat();
 expect(new Set(frames).size).toBe(frames.length);
 expect(frames).toEqual([...frames].sort((a,b)=>a-b));
 expect(frames.every(ms=>ms>=0 && ms<2_000)).toBe(true);
});
