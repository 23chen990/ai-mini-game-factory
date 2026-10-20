// Input-only learned route for the redesigned first level. Never imported by
// the game and never used to inject state, score, collision or save data.
import {newRun,input,advance} from './runtime/adventure.mjs';
export const PRESSURE_ROUTE=[
 [16,'right'],[39,'left'],[104,'jump'],[104,'wing-hold'],[116,'wing-release'],
 [134,'jump'],[168,'right'],[185,'left'],[188,'left'],[199,'jump'],[215,'right'],
 [227,'jump'],[227,'wing-hold'],[240,'wing-release'],[245,'left'],[278,'right'],[281,'right'],
];
export function drivePressureRoute(dt){
 const run=newRun(1);let index=0;
 while(run.phase==='running'){
  while(index<PRESSURE_ROUTE.length&&run.distance>=PRESSURE_ROUTE[index][0])
   input(run,PRESSURE_ROUTE[index++][1]);
  advance(run,dt);
 }
 return run;
}
