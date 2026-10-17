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
  const hasFpsUx=spec.id==='h5-source-mobile-v1'&&candidate.fpsUxVersion===1;
  const bundleModules=hasFpsUx
    ?['engine.mjs','themes.mjs','cf-cover-assault.mjs','fps-mobile-ux.mjs','cf-player-loop.mjs','main.mjs']
    :['engine.mjs','themes.mjs','main.mjs'];
  for(const name of bundleModules){
    const source=(await safeRead(gameRoot,name)).toString('utf8');let imports=0;
    const bundled=source.replace(/^import .*?;\r?\n/gm,line=>{
      const isMain=name==='main.mjs'&&
        /^import \{[^}]+\} from '\.\/(engine|themes|fps-mobile-ux|cf-player-loop|cf-cover-assault)\.mjs';\r?\n$/.test(line);
      // Only allow this one checked pure dependency from the extra CF
      // component; arbitrary imports from other modules remain prohibited.
      const isCf=name==='cf-player-loop.mjs'&&
        /^import \{challengeResult\} from '\.\/engine\.mjs';\r?\n$/.test(line);
      const isDefense=name==='fps-mobile-ux.mjs'&&
        /^import \{cfStartDefense,cfStepDefense,cfAdvanceAssault,cfStartExtraction,cfStepExtraction\} from '\.\/engine\.mjs';\r?\n$/.test(line);
      const isCover=name==='fps-mobile-ux.mjs'&&
        /^import \{createCfCoverAssault,cfV20CoverEnabled\} from '\.\/cf-cover-assault\.mjs';\r?\n$/.test(line);
      if(!isMain&&!isCf&&!isDefense&&!isCover)throw new Error(`Unsupported import in ${name}`);
      imports++;return '';
    }).replace(/^export /gm,'');
    const expectedImports=name==='main.mjs'?(hasFpsUx?5:2)
      :name==='cf-player-loop.mjs'?1:name==='fps-mobile-ux.mjs'?2:0;
    if(/^\s*(?:import|export)\s/m.test(bundled)||imports!==expectedImports)
      throw new Error(`Unsupported module syntax in ${name}`);
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
