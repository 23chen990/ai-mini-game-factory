import {canRevive,revive,input} from './adventure.mjs';

// This gate deliberately matches the existing verified H5 adapter. No ad slot
// is fabricated here. The production caller supplies the real adapter only.
export function reviveAvailable(config,tap){
 return config?.status===1&&config.source==='check_ads_status'&&!!config.appId&&
  config.screenOrientation===1&&typeof config.spaceId==='string'&&!!config.spaceId&&
  typeof tap?.createRewardedVideoAd==='function';
}
export const terminalDisposition=(run,available)=>canRevive(run)&&available?'await-revive':'settle';
export const reviveOfferVisible=run=>!!run&&run.revives===0&&['vehicle','barrier'].includes(run.reason);

export function createReviveController({currentRun,available,request,onGranted}){
 let pending=null,generation=0;
 return {
  invalidate(){generation++;pending=null;},
  async request(){
   const run=currentRun();
   if(pending)return {status:'busy'};
   if(!canRevive(run))return {status:'ineligible'};
   if(!available())return {status:'unavailable'};
   const token={generation};pending=token;
   let result;
   try{result=await request();}catch{result={status:'failed'};}
   finally{if(pending===token)pending=null;}
   if(currentRun()!==run||generation!==token.generation||!canRevive(run))return {status:'stale'};
   if(result?.status!=='completed')return {status:result?.status??'failed'};
   if(!revive(run))return {status:'ineligible'};
   // An SDK ad can blur/background the app. Returning from it never starts
   // traffic behind an overlay: protection begins only after explicit resume.
   input(run,'pause');onGranted(run);
   return {status:'revived'};
  },
 };
}
