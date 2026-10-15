import {z} from 'zod';

// The normal route menu has run=null; the read-only public API returns its
// earned save, without inventing a live event stream. Live/terminal branches
// must retain actual events so exact barrier-to-prize validation stays strict.
export const RiskSnapshotValueSchema=z.object({
 phase:z.enum(['ready','running','paused','finished']),
 events:z.array(z.object({type:z.string(),objectId:z.string().optional()}).passthrough()).optional(),
}).passthrough().superRefine((value,context)=>{
 if(value.phase!=='ready'&&!value.events)context.addIssue({code:'custom',path:['events'],message:'Live/terminal risk snapshots require actual gameplay events'});
});
