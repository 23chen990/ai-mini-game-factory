/* global console, process */
// Read-only native construction, not rendered/natural gameplay evidence.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {STAGES} from '../../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
const run=path.resolve('runs/h5-qq-mobile-20261013');
const src=run+'/workspace/source/qq-speed/src/';
const {Track}=await import(pathToFileURL(src+'track.js'));
const {LAYOUTS}=await import(pathToFileURL(src+'layouts.js'));
const geometry=JSON.parse(await readFile(run+'/artifacts/racing-v3-smoke/geometry-career30.json'));
const ai=JSON.parse(await readFile(run+'/artifacts/racing-v3-smoke/ai-pace-v115.json'));
const build=JSON.parse(await readFile(run+'/artifacts/build-racing.json'));
assert.equal(geometry.buildHash,build.buildHash);assert.equal(ai.buildHash,build.buildHash);
// Verify the actual ItemSystem constructor's placement contract before
// evaluating its positions. Unexpected generated source must fail, not guess.
const itemSource=await readFile(src+'items.js','utf8');
assert.ok(itemSource.includes('for (const f of [0.1, 0.35, 0.6, 0.85])'));
assert.ok(itemSource.includes('for (const lat of [-0.6, -0.3, 0, 0.3, 0.6])'));
const round=x=>+x.toFixed(2);
const rows=STAGES.map(stage=>{
 const track=new Track(LAYOUTS[stage.course]),g=geometry.courses[stage.id];
 const widths=Array.from({length:track.N},(_,i)=>track.v9WidthAt(i*track.ds)*2);
 const itemAnchors=[.1,.35,.6,.85].flatMap(f=>[-.6,-.3,0,.3,.6].map(l=>({fraction:f,lateralM:round(l*track.halfW),insideRoad:Math.abs(l*track.halfW)<track.v9WidthAt(f*track.length)})));
 assert.ok(itemAnchors.every(a=>a.insideRoad));
 const rivals=ai.cases.find(c=>c.id===stage.id).racers;
 return {stage:stage.id,name:stage.name,identity:g.v11CourseIdentity,mode:stage.mode,laps:stage.laps,raceFraction:g.raceFraction,lapLengthM:round(track.length),minHeightM:round(Math.min(...track.py)),maxHeightM:round(Math.max(...track.py)),maxAbsoluteGradePercent:round(Math.max(...Array.from(track.slope,Math.abs))*100),minWidthM:round(Math.min(...widths)),maxWidthM:round(Math.max(...widths)),directionChanges:g.directionChanges,sharpCurvePercent:g.sharpPct,padPositions:g.physicalPads,shortcut:geometry.shortcuts[stage.course]??null,itemBoxesWhenItemMode:20,itemModeActive:stage.mode==='item',itemAnchors,fixedSeedAiFinishRangeSeconds:[Math.min(...rivals.map(r=>r.finishTimeSec)),Math.max(...rivals.map(r=>r.finishTimeSec))]};
});
assert.equal(rows.length,30);
const result={schemaVersion:1,scope:'Constructed final native Track + verified ItemSystem placement; NO rendered or natural item pickup claim',buildHash:build.buildHash,sourceCommit:process.env.RACE_FINAL_SOURCE_SHA,rows};
await writeFile(run+'/artifacts/internal-experience-20261020/course-metrics18.json',JSON.stringify(result,null,2)+'\n');
let md='# 30 关原生路线与终点检查\n\n数据来自最终生成的 Track 构造、道具布置契约和五名真实物理 AI 固定种子回放，不是仅对关卡 JSON 或哈希计数。所有 AI 均依照原生进度/半圈/终点规则。自然玩家覆盖单独见验收报告，不能用本表替代。高度和宽度为实际采样极值；AI 耗时不是玩家平均局长。未发现独立道路减速带实现；不能把减速道具、弯道刹车或碰撞称为减速带。\n\n|关|模式|单圈 m|高度 m|道路宽 m|转向变化|陡弯 %|加速带|近道|AI 完赛秒|\n|---|---|---:|---:|---:|---:|---:|---:|---|---|\n';
for(const r of rows)md+=`|${r.stage} ${r.name}|${r.mode}|${r.lapLengthM}|${r.minHeightM}–${r.maxHeightM}|${r.minWidthM}–${r.maxWidthM}|${r.directionChanges}|${r.sharpCurvePercent}|${r.padPositions.length}|${r.shortcut?'有':''}|${r.fixedSeedAiFinishRangeSeconds.map(round).join('–')}|\n`;
md+='\n10 条近道的入口/出口和物理投影检查覆盖 05、10、12、13、16、18、22、25、27、30；分支宽度、窄口与路径长度保存在原始 JSON。近道时间代理不是实测玩家收益。道具赛构造在 4 个纵向位置各 5 个箱体，本次逐关检查横向锚点均位于对应道路内；真实拾取、时机、视觉可读性仍需自然道具赛验收。\n';
await writeFile('docs/lean-pilot/racing-internal-20261020/COURSES.zh-CN.md',md);
console.log(JSON.stringify({courses:rows.length,itemsInsideRoad:true,buildHash:build.buildHash}));
