import { safeRead } from './policy.mjs';
import { buildHash } from './runner.mjs';
import { candidateSpec } from './candidates.mjs';

/** Bundle the explicitly registered dependency-free candidates, not arbitrary external modules. */
export async function standaloneHtml(gameRoot,theme='observatory',runId='standalone'){
  const candidate=JSON.parse((await safeRead(gameRoot,'candidate.json')).toString('utf8'));
  const spec=candidateSpec(candidate.templateId);
  if(!spec.themes.includes(theme))throw new Error('Unknown theme');
  if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(runId))throw new Error('Invalid run id');
  let html=(await safeRead(gameRoot,'index.html')).toString('utf8');
  let platform = '';
  if (spec.id === 'h5-source-mobile-v1') {
    if (candidate.referenceId !== theme || !candidate.sourceRevision || !html.includes(`data-reference-game="${theme}"`)) throw Error('Private source must be bound before export');
    const config=JSON.parse((await safeRead(gameRoot,'platform.json')).toString('utf8'));
    const license=(await safeRead(gameRoot,'LICENSE.three.txt')).toString('utf8');
    if (license.length < 20) throw Error('Missing Three.js attribution');
    html=html.replace('</head>', `<!-- Three.js license\n${license.replaceAll('--','—')}\n--></head>`);
    platform=`window.__PLATFORM_META__=${JSON.stringify(config)};\n`;
  }
  const css=(await safeRead(gameRoot,'style.css')).toString('utf8');const scripts=[];
  for(const name of ['engine.mjs','themes.mjs','main.mjs']){
    const source=(await safeRead(gameRoot,name)).toString('utf8');let imports=0;
    const bundled=source.replace(/^import .*?;\r?\n/gm,line=>{
      if(name!=='main.mjs'||!/^import \{[^}]+\} from '\.\/(engine|themes)\.mjs';\r?\n$/.test(line))throw new Error(`Unsupported import in ${name}`);
      imports++;return '';
    }).replace(/^export /gm,'');
    if(/^\s*(?:import|export)\s/m.test(bundled)||(name==='main.mjs'&&imports!==2))throw new Error(`Unsupported module syntax in ${name}`);
    scripts.push(`// ${name}\n${bundled}`);
  }
  const replaceOne=(marker,replacement)=>{if(html.split(marker).length!==2)throw new Error(`Missing or repeated entry marker: ${marker}`);html=html.replace(marker,()=>replacement);};
  const hash=await buildHash(gameRoot);
  const script=`window.__BUILD_META__=${JSON.stringify({runId,buildHash:hash,templateId:spec.id})};\n${platform}(async()=>{\n${scripts.join('\n')}\n})();`;
  replaceOne('<link rel="stylesheet" href="style.css">',`<style>${css.replace(/<\/style/gi,'<\\/style')}</style>`);
  if(spec.id==='grid-merge-v1')replaceOne('data-theme="observatory"',`data-theme="${theme}" data-initial-theme="${theme}"`);
  replaceOne('<script type="module" src="main.mjs"></script>',`<script>${script.replace(/<\/script/gi,'<\\/script')}</script>`);
  return {html,buildHash:hash,theme};
}
