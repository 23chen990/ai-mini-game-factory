/* global process */
// Real Chromium on macOS can use Metal. Default headless SwiftShader on this
// host measured3.6FPS; that failed evidence is retained, never called a phone.
export function browserOptions(engine,platformName=process.platform,environment=process.env){
 if(engine!=='chromium')return {headless:true};
 if(platformName==='darwin')return {headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']};
 if(platformName==='linux'&&environment.QA_USE_MESA==='1')return {headless:false,args:['--use-gl=angle','--use-angle=gl','--enable-gpu','--ignore-gpu-blocklist']};
 return {headless:true,args:['--enable-unsafe-swiftshader']};
}
export const qaDpr=()=>Number(process.env.QA_DPR??3);
