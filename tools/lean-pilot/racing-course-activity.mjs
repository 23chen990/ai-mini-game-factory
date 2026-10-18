/** Read-only road-activity screening, not a boredom score or a driving bot.
 * Uses the actual Track.sample interface. No AI proximity, inventory, user skill
 * or finger latency is inferred from curvature. Fixed-speed seconds are labelled
 * modelling assumptions. The one-way return road is NEVER part of the sample.
 */
import { raceDistanceM } from '../../templates/web-lite/h5-source-mobile-v1/racing/session.mjs';
const round = value => Math.round(value * 100) / 100;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function measureCourseActivity(track, stage, {stepM = 3, lowCurvature = .003} = {}) {
  if (typeof track?.sample !== 'function' || !stage ||
      !Number.isFinite(stepM) || stepM < 1 || stepM > 20 ||
      !Number.isFinite(lowCurvature) || lowCurvature <= 0 || lowCurvature > .1)
    throw Error('Invalid course activity request');
  const distance = raceDistanceM(track.length,stage);
  const count = Math.ceil(distance/stepM), ds=distance/count;
  const sample = d => {
    // Clamp in race coordinates first, THEN wrap only for actual lap transitions.
    const clamped=Math.max(0,Math.min(distance,d));
    const along=clamped>=track.length ? clamped%track.length : clamped;
    const p=track.sample(along,{});
    if (![p?.x,p?.y,p?.z].every(Number.isFinite)) throw Error('Non-finite native road sample');
    return p;
  };
  const heading = d => {
    const a=sample(d-4),b=sample(d+4);
    return Math.atan2(b.x-a.x,b.z-a.z);
  };
  const lowWindows=[],turnWindows=[];
  let lowStart=null,turnStart=null,lowCount=0,firstAboveLow=null,maxGrade=0;
  const append=(list,start,end)=>list.push({startM:round(start),endM:round(end),lengthM:round(end-start)});
  for(let i=0;i<=count;i++) {
    const edge=Math.min(distance,i*ds);
    let quiet=false,turn=false;
    if(i<count) {
      const d=edge+ds/2,a=Math.max(0,d-9),b=Math.min(distance,d+9);
      const c=wrap(heading(b)-heading(a))/(b-a);
      quiet=Math.abs(c)<lowCurvature;turn=Math.abs(c)>=.006;
      if(quiet)lowCount++;else if(firstAboveLow===null)firstAboveLow=edge;
      const p=sample(a),q=sample(b);
      maxGrade=Math.max(maxGrade,Math.abs(q.y-p.y)/Math.max(.01,b-a));
    }
    if(quiet&&lowStart===null)lowStart=edge;
    if(!quiet&&lowStart!==null){append(lowWindows,lowStart,edge);lowStart=null;}
    if(turn&&turnStart===null)turnStart=edge;
    if(!turn&&turnStart!==null){
      if(edge-turnStart>=12)append(turnWindows,turnStart,edge);
      turnStart=null;
    }
  }
  const longest=lowWindows.reduce((best,row)=>row.lengthM>best.lengthM?row:best,{startM:0,endM:0,lengthM:0});
  return {
    course:stage.course,scope:'native-road geometry only; NOT human engagement or input latency',
    loopLengthM:round(track.length),raceDistanceM:round(distance),stepM:round(ds),
    lowCurvatureThreshold:lowCurvature,lowCurvaturePercent:round(lowCount/count*100),
    firstAboveLowCurvatureM:firstAboveLow===null?null:round(firstAboveLow),
    longestLowCurvature:longest,
    longestWindowModelSeconds:{at35Mps:round(longest.lengthM/35),at45Mps:round(longest.lengthM/45),at60Mps:round(longest.lengthM/60)},
    lowCurvatureWindows:lowWindows,turnWindows,maxSampledGrade:round(maxGrade),
    warning:longest.lengthM>360?'REVIEW: long low-turn interval; inspect actual choices and traffic':null,
    humanPlayability:'NOT_RUN'
  };
}
