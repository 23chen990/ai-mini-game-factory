const WHEEL_NAMES = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'];
const MATERIAL_NAMES = ['BodyPaint', 'Glass', 'Tire', 'Rim', 'Headlight', 'Taillight', 'Trim'];
const BODY_PAINT_PROGRAM_KEY = 'generated-car-body-paint-mask-v1';

function installBodyPaintMask(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
float paintMask = smoothstep(0.16, 0.6, min(sampledDiffuseColor.r, min(sampledDiffuseColor.g, sampledDiffuseColor.b)));
diffuseColor.rgb = sampledDiffuseColor.rgb * mix(vec3(1.0), diffuse, paintMask);`,
    );
  };
  material.customProgramCacheKey = () => BODY_PAINT_PROGRAM_KEY;
}

function cloneWithMaterials(source, materials) {
  const clone = source.clone(true);
  clone.traverse(object => {
    if (!object.isMesh) return;
    const cloneMaterial = material => {
      if (!materials.has(material)) materials.set(material, material.clone());
      return materials.get(material);
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });
  return clone;
}

export function createGeneratedCarFactory(THREE, templateScene, assetIdentity) {
  const chassisTemplate = templateScene.getObjectByName('Chassis');
  const wheelTemplates = WHEEL_NAMES.map(name => templateScene.getObjectByName(name));
  const materialSources = new Map();
  templateScene.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materialSources.set(material.name, material);
    }
  });
  const requiredMaterials = MATERIAL_NAMES.map(name => materialSources.get(name));
  const exhaustPositions = templateScene.userData.exhausts;

  const instantiate = skin => {
    const materialInstances = new Map(requiredMaterials.map(material => [material, material.clone()]));
    const body = new THREE.Group();
    body.add(cloneWithMaterials(chassisTemplate, materialInstances));

    const wheels = wheelTemplates.map((wheelTemplate, index) => {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      const wheel = cloneWithMaterials(wheelTemplate, materialInstances);
      const { x, y, z } = wheelTemplate.position;
      wheel.position.set(0, 0, 0);
      steer.position.set(x, y, z);
      steer.add(spin);
      spin.add(wheel);
      return { steer, spin, front: index < 2, x, z };
    });

    const bodyPaint = materialInstances.get(materialSources.get('BodyPaint'));
    bodyPaint.color.set(skin.body);
    installBodyPaintMask(bodyPaint);
    materialInstances.get(materialSources.get('Rim')).color.set(skin.rim);
    const tailMaterial = materialInstances.get(materialSources.get('Taillight'));
    const exhausts = exhaustPositions.map(([x, y, z]) => new THREE.Vector3(x, y, z));

    return { body, wheels, exhausts, tailMaterial, assetIdentity };
  };
  return { instantiate };
}
