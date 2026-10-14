/**
 * Mobile two-key recovery, reusing the native Game.resetPlayer() method.
 * Does not edit laps, standings or checkpoint progress, or charge extra fuel.
 */
export class WrongWayRecovery {
  constructor(){this.reset();}
  reset(){
    this.lastAt=-1000;this.warned=false;this.idleSince=null;
    this.stallSince=null;this.stallProgress=null;this.stallWarned=false;
  }
  stallDuration(p,now) {
    // Steering-only cars cannot reverse away from a barrier. Detect a true lack
    // of track progress instead of relying on engine RPM or contact flashes.
    if (now<4 || !Number.isFinite(p.progress)) {
      this.stallSince=null;this.stallProgress=null;this.stallWarned=false;
      return 0;
    }
    if (this.stallSince===null || !Number.isFinite(this.stallProgress) ||
        Math.abs(p.progress-this.stallProgress)>=5) {
      this.stallSince=now;this.stallProgress=p.progress;this.stallWarned=false;
    }
    return Math.max(0,now-this.stallSince);
  }
  frame(game) {
    if (!game || game.state !== 'race' || !game.player || game.player.finished) return null;
    const p=game.player, now=game.raceTime;
    if (!Number.isFinite(now) || typeof game.resetPlayer !== 'function' || p.airborne) return null;
    let facingWrong=false;
    if (game.track?.sample && Number.isFinite(p.h) && Number.isFinite(p.d)) {
      const tangent=game.track.sample(p.d,{});
      facingWrong=Number.isFinite(tangent.hd) && Math.cos(p.h-tangent.hd)<-.45;
    }
    const stoppedWrong=facingWrong && Math.abs(p.s ?? 0)<5;
    if(stoppedWrong){if(this.idleSince===null)this.idleSince=now;}
    else this.idleSince=null;
    const idleTime=this.idleSince===null?0:Math.max(0,now-this.idleSince);
    const wrong=Number.isFinite(p.wrongWay)?p.wrongWay:0;
    const stalledFor=this.stallDuration(p,now);
    if (wrong<.45 && idleTime<.5) this.warned=false;
    if (now-this.lastAt<8) return null;
    if (wrong>=2.4 || idleTime>=3.0 || stalledFor>=6.0) {
      // Native reset reuses the CURRENT progress + checkpoint state. No shortcut,
      // fake lap, extra life, or extra fuel is granted.
      const blocked=wrong<2.4 && idleTime<3.0;
      game.resetPlayer();
      if(game.player)game.player.wrongWay=0;
      this.warned=false;this.idleSince=null;this.lastAt=now;
      this.stallSince=null;this.stallProgress=null;this.stallWarned=false;
      return blocked ? 'stuck-recovered' : 'recovered';
    }
    if ((wrong>=1 || idleTime>=1) && !this.warned) {
      this.warned=true;return 'warning';
    }
    if (wrong<.45 && idleTime<.5 && stalledFor>=3.5 && !this.stallWarned) {
      this.stallWarned=true;return 'stuck-warning';
    }
    return null;
  }
}
