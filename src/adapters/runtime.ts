import type { AssetManifest, GameBlueprint, StyleLock } from '../schemas/index.js';
import type { Hybrid3dAssetResearchArtifact } from '../schemas/hybrid-3d-assets.js';

export interface RuntimeAdapter {
  createProject(workspace: string, template: string): Promise<void>;
  applyBlueprint(workspace: string, blueprint: GameBlueprint, styleLock: StyleLock): Promise<void>;
  importAssets(workspace: string, manifest: AssetManifest, sourceDir: string): Promise<void>;
  importApproved3dAssets?(workspace: string, research: Hybrid3dAssetResearchArtifact, sourceRoot: string): Promise<void>;
  verifyProject(workspace: string, options: { requireScripts: boolean }): Promise<string[]>;
  verifyFormalProject?(workspace: string): Promise<string[]>;
  startPreview(workspace: string): Promise<{ url: string; stop: () => Promise<void> }>;
  buildWeb(workspace: string): Promise<string>;
  buildTarget(workspace: string, target: string): Promise<string>;
  stopPreview(): Promise<void>;
}
