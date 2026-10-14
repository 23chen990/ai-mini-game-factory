/**
 * Mobile two-key recovery, reusing the native Game.resetPlayer() method.
 * Does not edit laps, standings or checkpoint progress, or charge extra fuel.
 */
export class WrongWayRecovery {
  constructor(){this.reset();}
  reset(){this.lastAt=-1000;this.warned=false;this.idleSince=null;}
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
    if (wrong<.45 && idleTime<.5) {this.warned=false;return null;}
    const cooldown=now-this.lastAt<8;
    if (cooldown) return null;
    if (wrong>=2.4 || idleTime>=3.0) {
      // Native reset projects to current road progress; no forward progress grant.
      game.resetPlayer();
      if(game.player)game.player.wrongWay=0;
      this.warned=false;this.idleSince=null;this.lastAt=now;
      return 'recovered';
    }
    if (!this.warned && (wrong>=1.0 || idleTime>=1.0)) {
      this.warned=true;return 'warning';
    }
    return null;
  }
}
