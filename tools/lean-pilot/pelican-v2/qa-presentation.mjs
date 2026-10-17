/* global window, document */
export function readCompactPresentation() {
 const toBox=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const buttons=[...document.querySelectorAll('#co-controls button')].map(toBox),mastery=document.querySelector('#co-mastery');
 return {running:document.querySelector('#coast')?.dataset.phase==='running',buttons,bar:toBox(mastery),font:parseFloat(window.getComputedStyle(mastery).fontSize),
  goalFonts:[...mastery.querySelectorAll('[data-goal]')].map(n=>parseFloat(window.getComputedStyle(n).fontSize)),
  goalBottom:Math.max(...[...document.querySelectorAll('.co-goal')].map(n=>toBox(n).bottom)),radarLabel:toBox(document.querySelector('#co-radar-label')),
  gauge:toBox(document.querySelector('.co-lane-indicator')),controlTop:Math.min(...buttons.map(b=>b.y)),bodyWidth:document.documentElement.scrollWidth,canvas:toBox(document.querySelector('canvas'))};
}

export function portraitThumbGroupingPassed(buttons) {
 if(!Array.isArray(buttons)||buttons.length!==3)return false;
 const [left,right,jump]=buttons;
 // Pair the steering targets for one thumb while keeping the jump target
 // isolated, reducing accidental opposite input during a risky turn.
 const steeringGap=right.x-left.right,jumpGap=jump.x-right.right;
 return steeringGap>=3&&steeringGap<=14&&jumpGap>=24&&
  left.width>=54&&right.width>=54&&jump.width>=54;
}
export function compactPresentationPassed(s) {
 return s.running&&portraitThumbGroupingPassed(s.buttons)&&s.buttons.length===3&&s.buttons.every(b=>b.width>=54&&b.height>=44&&b.x>=0&&b.right<=320&&b.bottom<=568)&&
  s.font>=12&&s.goalFonts.length===5&&s.goalFonts.every(f=>f>=12)&&s.bar.x>=0&&s.bar.right<=320&&s.bar.y>=s.goalBottom&&s.bar.bottom<=s.radarLabel.y&&s.bodyWidth<=320;
}

export function portraitMasteryClear(s){
 return s.bar.y>=s.goalBottom&&s.bar.bottom<=s.radarLabel.y&&(!s.gauge||s.gauge.y>=s.bar.bottom&&s.gauge.bottom<=s.radarLabel.y)&&s.font>=12&&
  s.goalFonts.length===5&&s.goalFonts.every(font=>font>=12);
}

export function readRoutePresentation() {
 const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
 return {ready:document.querySelector('#coast')?.dataset.phase==='ready',rows:[...document.querySelectorAll('#co-route [data-level]')].map(row=>({box:box(row),titleFont:parseFloat(window.getComputedStyle(row.querySelector('b')).fontSize),contents:[...row.querySelectorAll('b,small,em')].map(box)}))};
}

export function routePresentationPassed(r) {
 return r.ready&&r.rows.length>0&&r.rows.every((row,i)=>row.titleFont>=13&&row.contents.every(c=>c.x>=row.box.x&&c.right<=row.box.right+.5&&c.y>=row.box.y&&c.bottom<=row.box.bottom+.5)&&(i===0||row.box.y>=r.rows[i-1].box.bottom));
}
