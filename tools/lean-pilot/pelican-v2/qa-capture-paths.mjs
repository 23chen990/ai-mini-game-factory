// Different natural journeys can encounter the same stage. Preserve each
// scenario's original pixels instead of overwriting a sibling branch's PNG.
export function capturePath(section, name) {
 if(!['setup','campaign','collisions','safety'].includes(section)||!/^[a-z0-9-]+$/u.test(name))throw Error('Unsafe QA capture path');
 return section+'/'+name+'.png';
}
