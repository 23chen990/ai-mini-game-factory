/** User cars are independently baked textured meshes, not the starter's
 * articulated/paint-mask rig. Their preparation fixes orientation and scale;
 * runtime validation rejects a broken export instead of hiding it by resizing. */
export function createUserCarFactory(THREE, templateScene, assetIdentity, metadata) {
  if (metadata?.paintable !== false || !['static-baked', 'static-source-mesh'].includes(metadata?.wheelMode))
    throw Error('User car must declare its baked texture and static wheel contract');
  const normalization = metadata.normalization;
  if (normalization?.up !== '+Y' || normalization.forward !== '+Z' ||
      normalization.groundY !== 0 || normalization.runtimeScale !== 1 || normalization.lengthM !== 4.8 ||
      normalization.centerXZ?.length !== 2 || normalization.centerXZ.some(value => value !== 0))
    throw Error('User car normalization metadata differs from the native presentation contract');
  let meshes = 0;
  templateScene.traverse(object => {
    if (object.isSkinnedMesh || object.animations?.length) throw Error('Animated or skinned user car requires an explicit adapter');
    if (!object.isMesh) return;
    meshes++;
    if (!object.geometry?.attributes?.position || !object.material)
      throw Error('User car mesh lacks geometry or material');
  });
  if (!meshes) throw Error('User car has no mesh');
  templateScene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(templateScene);
  const min = bounds.min.toArray(), max = bounds.max.toArray(), tolerance = 0.025;
  if (![...min, ...max].every(Number.isFinite) || min.some((value, axis) => value >= max[axis]) ||
      Math.abs(min[1]) > tolerance || Math.abs(max[2] - min[2] - 4.8) > tolerance ||
      Math.abs(min[0] + max[0]) > tolerance || Math.abs(min[2] + max[2]) > tolerance ||
      ![metadata.bounds?.min, metadata.bounds?.max].every(vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite)) ||
      min.some((value, axis) => Math.abs(value - metadata.bounds.min[axis]) > tolerance) ||
      max.some((value, axis) => Math.abs(value - metadata.bounds.max[axis]) > tolerance))
    throw Error('User car actual bounds do not match its baked normalization');
  const identity = Object.freeze({ ...assetIdentity });
  const width = max[0] - min[0], height = max[1] - min[1];
  const exhaustPositions = [[-width * 0.16, Math.max(0.24, Math.min(0.55, height * 0.24)), min[2] + 0.06],
    [width * 0.16, Math.max(0.24, Math.min(0.55, height * 0.24)), min[2] + 0.06]];
  return {
    instantiate() {
      const materials = new Map(), body = new THREE.Group(), clone = templateScene.clone(true);
      clone.traverse(object => {
        if (!object.isMesh) return;
        const own = material => {
          if (!materials.has(material)) {
            const privateMaterial = material.clone();
            // Preserve the supplied albedo, PBR maps and merged-wheel topology.
            // Bound specular response after the baked roughness map: lowering
            // environment intensity alone left near-mirror texels in these GLBs.
            privateMaterial.envMapIntensity *= .45;
            privateMaterial.metalness *= .55;
            privateMaterial.onBeforeCompile = shader => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>',
                '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.38);',
              );
            };
            privateMaterial.customProgramCacheKey = () => 'user-car-bounded-finish-v1';
            materials.set(material, privateMaterial);
          }
          return materials.get(material);
        };
        object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material);
      });
      body.add(clone);
      return { body, wheels: [], exhausts: exhaustPositions.map(position => new THREE.Vector3(...position)),
        tailMaterial: null, assetIdentity: identity };
    },
  };
}
