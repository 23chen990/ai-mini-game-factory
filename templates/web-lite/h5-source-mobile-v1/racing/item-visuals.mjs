/**
 * Runs inside the PINNED native Three.js source after the original ItemSystem
 * creates boxes. Reuses native meshes + textTexture: no external art/license.
 */
import { textTexture } from './textures.js';

export function upgradeItemBoxes(system, THREE) {
  if (!system?.boxes || system.__RACE_V31_VISUALS__) return 0;
  // Original tiny question-mark planes are barely legible on real mobile screens.
  // Larger glowing diamonds + camera-facing high-contrast ? stay identifiable
  // without promising the type of RANDOM item inside.
  const question = textTexture('?', {
    w: 256, h: 256, bg: null, fg: '#fffce0',
    font: '900 205px Arial Black, Arial', stroke: '#113d80',
  });
  const spriteMaterial = new THREE.SpriteMaterial({
    map: question, color: 0xffffff, transparent: true, depthWrite: false,
    depthTest: true, opacity: 1,
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe695, transparent: true, opacity: .9, depthWrite: false,
  });
  const ringGeometry = new THREE.TorusGeometry(2.2, .09, 5, 22);
  let changed = 0;
  for (const [index, box] of system.boxes.entries()) {
    if (!box?.cube || !box.g) continue;
    const previousGeometry = box.cube.geometry;
    box.cube.geometry = new THREE.IcosahedronGeometry(2.05, 0);
    previousGeometry?.dispose?.();
    box.cube.material.color.setHex(index % 2 === 0 ? 0x23a3df : 0x25c5ad);
    box.cube.material.emissive.setHex(index % 2 === 0 ? 0x2361ff : 0x10b49a);
    box.cube.material.emissiveIntensity = 1.1;
    box.cube.material.opacity = .92;
    for (const child of box.g.children) if (child !== box.cube) child.visible = false;
    const halo = new THREE.Mesh(ringGeometry, ringMaterial);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.85;
    box.g.add(halo);
    const icon = new THREE.Sprite(spriteMaterial);
    icon.scale.set(3.8, 3.8, 1);
    icon.position.y = .34;
    icon.renderOrder = 2;
    box.g.add(icon);
    changed++;
  }
  system.__RACE_V31_VISUALS__ = true;
  return changed;
}
