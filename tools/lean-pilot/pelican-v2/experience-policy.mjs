// Player decisions use visible feedback and persistent mastery counters. A
// slow screenshot may miss a toast; it must not lock the rider onto a hazard.
export const earnedJumpRewardVisible = (current, before) =>
 current.feedback.includes('奖励金鱼') ||
 Number.isFinite(current.gold) && Number.isFinite(current.jumps) &&
 current.gold >= before.gold + 1 && current.jumps >= before.jumps + 1;

// CI software rasterization exercises the shipped efficient preset through
// public menu touches. Native-GPU local QA retains the default presentation.
export function softwareQualityActions(requested) {
 if(requested===undefined)return [];
 if(requested==='efficient')return ['#co-quality','#co-quality'];
 throw Error('Unsupported software renderer quality request: '+requested);
}

export function experienceReportDirectory(engine, label) {
 if(label===undefined)return 'experience-'+engine;
 if(!/^[a-z0-9-]+$/u.test(label))throw Error('Unsafe experience retest directory label');
 return 'experience-'+engine+'-'+label;
}
