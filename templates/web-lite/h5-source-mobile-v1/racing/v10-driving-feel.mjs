/**
 * V10 driving contract. All outputs change real vehicle/camera feedback only;
 * no hidden auto-steer, speed gift, teleport, or finish line overrides.
 * Phone: close chase + reliable apex visibility + controllable opposite lock.
 */
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const wrap=rad=>Math.atan2(Math.sin(rad),Math.cos(rad));
export const V10_DRIVE_TUNE=Object.freeze({
  steeringNormal:24, steeringReverse:44, steeringNeutral:32,
  mobileHighSpeedTurnRetention:.58,
  minCountersteerAxis:.12,
  cameraRollLimit:.048,
  maxCameraFov:72,
});
export function v10SteerDamping(previous,target) {
  if(!Number.isFinite(previous)||!Number.isFinite(target))
    throw Error('Non-finite steering input');
  const t=clamp(target,-1,1),p=clamp(previous,-1,1);
  if(Math.abs(t)<.08)return V10_DRIVE_TUNE.steeringNeutral;
  if(Math.abs(p)>.07&&Math.sign(p)!==Math.sign(t))
    return V10_DRIVE_TUNE.steeringReverse;
  return V10_DRIVE_TUNE.steeringNormal;
}
/** Holds enough rotational momentum for a drift, but opposite stick input
 * actively pulls the heading back rather than requiring a full release.
 * Both left and right remain symmetric and deterministic at 120 Hz.
 */
export function v10DriftYaw(align,held,releaseTime,tune) {
  if(!Number.isFinite(align)||!Number.isFinite(releaseTime)||
     !Number.isFinite(tune?.driftYaw)||!Number.isFinite(tune?.driftYawAlign))
    throw Error('Invalid drift feedback');
  const a=clamp(align,-1,1),r=Math.max(0,releaseTime);
  if(held)return a<-.08
    ? -tune.driftYawAlign*1.78*Math.min(1,-a)
    : tune.driftYaw*Math.max(0,a)+tune.driftYawAlign*a;
  return (a<-.08?-1.62*Math.min(1,-a):.30+.75*a)*Math.exp(-3.15*r);
}
export function v10MobileCameraPreset(speed,drifting,driftAngle) {
  const v=clamp(Math.abs(Number.isFinite(speed)?speed:0),0,90),
    slide=clamp(Math.abs(Number.isFinite(driftAngle)?driftAngle:0),0,1.2);
  return {
    // Handset composition only. Desktop keeps the native chase modes/FOV.
    dist:7.1+v*.009,
    h:2.65+v*.004,
    look:7.6+v*.042+(drifting?1.15:0),
    lookH:1.18+v*.005,
    roll:clamp(slide*.048,0,V10_DRIVE_TUNE.cameraRollLimit),
  };
}
export function v10MobileCameraYaw(heading,velocityHeading,drifting,speed) {
  if(!Number.isFinite(heading)||!Number.isFinite(velocityHeading))
    throw Error('Invalid native chase camera heading');
  if(speed<0)return heading;
  // Crucial: the camera keeps the road and forward exit visible DURING a
  // sideways drift, not just after the vehicle is already facing the exit.
  return velocityHeading+clamp(wrap(heading-velocityHeading),-.95,.95)*
    (drifting?.52:.23);
}
export function v10MobileFov(speed,nitro,small) {
  const v=clamp(Math.abs(Number.isFinite(speed)?speed:0),0,90);
  return clamp(63+v*.06+(nitro?2.6:0)+(small?1:0),
    63,V10_DRIVE_TUNE.maxCameraFov);
}
export function v10TrackFacingLook(player,track) {
  const speed=Math.max(0,Number.isFinite(player?.s)?player.s:0);
  const distance=clamp(speed*1.08,18,70);
  if(!track?.sample||!Number.isFinite(player?.progress))
    return {x:0,y:0,z:0,available:false};
  const ahead=track.sample((Number.isFinite(player.d)?player.d:player.progress)+distance,{});
  if(![ahead?.x,ahead?.y,ahead?.z].every(Number.isFinite))
    return {x:0,y:0,z:0,available:false};
  return {x:ahead.x,y:ahead.y,z:ahead.z,available:true};
}
