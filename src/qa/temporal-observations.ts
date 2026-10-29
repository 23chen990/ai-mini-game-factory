import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256File, writeJsonAtomic } from '../core/files.js';

/** Three neutral windows, not issue-specific expected outcomes. */
export function temporalWindows(durationMs: number): number[][] {
  return [0.1, 0.5, 0.93].map(center => {
    const span = Math.min(center > 0.9 ? 2_500 : 800, durationMs * 0.12);
    const start = Math.min(Math.max(0, durationMs * center - span / 2), durationMs - 80 - span);
    return Array.from({length:6}, (_, index) => Math.round(start + index * span / 5));
  });
}

/** Decode existing Playwright video locally. No model, new gameplay, or state
 * oracle is involved. Video PTS and input-clock offsets must stay distinct. */
export async function captureTemporalObservations(input: {runRoot:string;videoPath:string;outputDir:string;buildHash:string;tracePath:string}) {
  const video = await readFile(path.join(input.runRoot,input.videoPath));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<video muted></video><canvas></canvas>');
    const durationMs = await page.evaluate(async base64 => {
      const video = document.querySelector('video')!;
      video.src = `data:video/webm;base64,${base64}`;
      await new Promise<void>((resolve,reject)=>{video.onloadedmetadata=()=>resolve();video.onerror=()=>reject(new Error('Local recording cannot be decoded'));});
      return Math.round(video.duration * 1000);
    },video.toString('base64'));
    await mkdir(path.join(input.runRoot,input.outputDir),{recursive:true});
    const sheets = [];
    for (const [index,times] of temporalWindows(durationMs).entries()) {
      const data = await page.evaluate(async times => {
        const video = document.querySelector('video')!;
        const canvas = document.querySelector('canvas')!;
        const width=260, height=600;
        canvas.width=width*3;canvas.height=height*2;
        const ctx=canvas.getContext('2d')!;ctx.fillStyle='#15191f';ctx.fillRect(0,0,canvas.width,canvas.height);
        for (const [index,ms] of times.entries()) {
          await new Promise<void>((resolve,reject)=>{video.onseeked=()=>resolve();video.onerror=()=>reject(new Error('Video seek failed'));video.currentTime=ms/1000;});
          const x=(index%3)*width,y=Math.floor(index/3)*height;
          ctx.drawImage(video,x,y+30,width,video.videoHeight*width/video.videoWidth);
          ctx.fillStyle='#ffffff';ctx.font='16px monospace';ctx.fillText(`VIDEO ${(ms/1000).toFixed(3)}s`,x+8,y+22);
        }
        return canvas.toDataURL('image/png').split(',')[1]!;
      },times);
      const relative=path.join(input.outputDir,`sequence-${index+1}.png`);
      await writeFile(path.join(input.runRoot,relative),Buffer.from(data,'base64'));
      sheets.push({path:relative,sha256:await sha256File(path.join(input.runRoot,relative)),requestedVideoTimesMs:times});
    }
    const evidence={schemaVersion:1,scope:'SAMPLED_VIDEO_PIXELS_NOT_AGENT_JUDGMENT',buildHash:input.buildHash,
      video:{path:input.videoPath,sha256:await sha256File(path.join(input.runRoot,input.videoPath)),durationMs},
      trace:{path:input.tracePath,sha256:await sha256File(path.join(input.runRoot,input.tracePath))},sheets,
      limitations:['Labels are requested video seek times; nearest decoded frame may differ by one source frame.','Historical video and host input clocks were not synchronized; exact input-to-frame offset is UNKNOWN.','Gaps between samples cannot prove transient absence, exact collision timing, frame-rate independence or unseen branches.']};
    await writeJsonAtomic(path.join(input.runRoot,input.outputDir,'manifest.json'),evidence);
    return evidence;
  } finally {await browser.close();}
}
