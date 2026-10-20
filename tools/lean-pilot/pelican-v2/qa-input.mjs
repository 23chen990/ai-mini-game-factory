// A recorded attempt6 touch raced with real settlement between hit-test and
// dispatch. Keep it as a late request, never as a gameplay action.
export function classifyGameplayDispatch(action,events,phase){
 if(events.some(e=>!e.trusted))throw Error('Untrusted input in natural journey');
 if(events.some(e=>e.type==='pointerdown'&&e.action===action))return 'delivered';
 if(phase==='finished')return 'terminal-before-dispatch';
 throw Error('Gameplay input not delivered to its control');
}
