/* global process */
// Real Chromium on macOS can use Metal. Default headless SwiftShader on this
// host measured3.6FPS; that failed evidence is retained, never called a phone.
export function browserOptions(engine){return engine==='chromium'?(process.platform==='darwin'?{headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']}:{headless:true,args:['--enable-unsafe-swiftshader']}):{headless:true};}
export const qaDpr=()=>Number(process.env.QA_DPR??3);
