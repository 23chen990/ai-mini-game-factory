import { CAR_MODELS, carOwned } from './cosmetics.mjs';

/** Home-only browsing. A preview is never an ownership or race entitlement. */
export class CarGarage {
  constructor(career, preview, changed=()=>{}, canPreview=()=>!career.active) {
    this.career=career;this.preview=preview;this.changed=changed;this.canPreview=canPreview;
    this.serial=0;this.id=career.progress.car;this.displayedId=null;
    this.busy=false;this.error=null;
  }
  canBrowse() { return this.canPreview()&&!this.career.active&&!this.career.adBusy; }
  snapshot() {
    const owned=carOwned(this.career.progress,this.id);
    const ready=this.canBrowse()&&!this.busy&&!this.error&&this.displayedId===this.id;
    return {id:this.id,model:CAR_MODELS.find(model=>model.id===this.id),owned,busy:this.busy,
      error:this.error,equipped:owned&&this.id===this.career.progress.car,
      canRace:ready&&owned&&this.id===this.career.progress.car,
      canWatch:ready&&!owned&&this.career.canOfferCarAd(this.id)};
  }
  /** Called around the existing native demo/track lifecycle; invalidates awaits. */
  reset(displayed=false) {
    this.serial++;this.id=this.career.progress.car;this.displayedId=displayed?this.id:null;
    this.busy=false;this.error=null;this.changed();
  }
  async select(id) {
    if(!CAR_MODELS.some(model=>model.id===id)||!this.canBrowse())
      return {status:'unavailable'};
    const serial=++this.serial,epoch=this.career.stageAdEpoch;
    const stale=()=>{
      // An older request must never clear a newer successful selection.
      if(serial!==this.serial)return true;
      if(!this.canBrowse()||epoch!==this.career.stageAdEpoch){this.displayedId=null;return true;}
      return false;
    };
    this.id=id;this.busy=true;this.error=null;this.changed();
    try {
      const shown=await this.preview(id);
      if(stale())return {status:'stale'};
      if(shown?.status!=='ready'||shown.carId!==id)throw Error('Native preview was not displayed');
      this.displayedId=id;
      if(carOwned(this.career.progress,id)) {
        if(!this.career.setCar(id)) {
          const previousId=this.career.progress.car;this.id=previousId;
          const restored=await this.preview(previousId);
          if(stale())return {status:'stale'};
          if(restored?.status!=='ready'||restored.carId!==previousId)throw Error('Previous appearance could not be restored');
          this.displayedId=previousId;
          return {status:'save-failed'};
        }
        return {status:'equipped',id};
      }
      return {status:'preview',id};
    } catch {
      if(stale())return {status:'stale'};
      this.error='load-failed';this.displayedId=null;
      return {status:'load-failed',id};
    } finally {
      if(serial===this.serial){this.busy=false;this.changed();}
    }
  }
  async unlock() {
    if(!this.snapshot().canWatch)return {status:'unavailable'};
    const id=this.id,serial=this.serial;
    const promise=this.career.watchCarAd(id);this.changed();
    const out=await promise;
    if(serial!==this.serial||id!==this.id){this.changed();return {status:'stale'};}
    if(out.status!=='completed'){this.changed();return out;}
    // The durable grant already exists. Selection is a distinct durable action.
    const selection=await this.select(id);
    return {status:'completed',id,equipped:selection.status==='equipped'};
  }
}
