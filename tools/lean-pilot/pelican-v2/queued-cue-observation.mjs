/* global window, document, requestAnimationFrame, MutationObserver */
// Read-only presentation observation. Install after the actual controls load;
// never synthesize input, edit game/save state, or infer visibility from events.
export function observePreparedJump() {
 const button=document.querySelector('#co-controls [data-action="jump"]');
 if(!button)throw Error('Actual jump control is not loaded');
 const frames=[];
 window.__qaPreparedJumpFrames=frames;
 const visible=(node,interactive=false)=>{
  if(!node)return false;
  const r=node.getBoundingClientRect(),style=window.getComputedStyle(node);
  if(r.width<=0||r.height<=0||r.left<0||r.top<0||r.right>window.innerWidth||r.bottom>window.innerHeight||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)<=0)return false;
  for(let ancestor=node;ancestor;ancestor=ancestor.parentElement){const computed=window.getComputedStyle(ancestor);if(computed.display==='none'||computed.visibility!=='visible'||Number(computed.opacity)<.5)return false;}
  // Feedback inherits pointer-events:none by design; only the actual button
  // must also be the unobscured hit target for normal touch interaction.
  if(!interactive)return true;
  const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return !!hit&&(node===hit||node.contains(hit));
 };
 const observe=source=>{
  if(!button.classList.contains('queued'))return;
  const feedback=document.querySelector('#co-feedback strong'),feedbackPanel=feedback?.parentElement;
  frames.push({at:window.performance.now(),source,queued:true,buttonVisible:visible(button,true),feedbackVisible:visible(feedback),feedbackOpacity:feedbackPanel?Number(window.getComputedStyle(feedbackPanel).opacity):null,feedback:feedback?.textContent??'',bufferedJump:window.__coast?.snapshot().bufferedJump??null});
  if(frames.length>256)frames.shift();
 };
 new MutationObserver(()=>observe('actual-control-class-mutation')).observe(button,{attributes:true,attributeFilter:['class']});
 const frame=()=>{observe('actual-render-frame');requestAnimationFrame(frame);};
 requestAnimationFrame(frame);
 window.__qaObservePreparedJump=()=>{observe('immediate-read-only-dom');return frames.map(f=>({...f}));};
}

export function preparedJumpSeen(frames,objectId) {
 return frames.some(f=>f.queued===true&&f.buttonVisible===true&&f.feedbackVisible===true&&f.bufferedJump===objectId&&typeof f.feedback==='string'&&f.feedback.includes('已准备'));
}
