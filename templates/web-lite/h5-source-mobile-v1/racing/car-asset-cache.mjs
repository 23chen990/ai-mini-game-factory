/** Binary decoding is queued and lazy. Only instantiated cars retain a shared
 * template; the starter is pinned because the native grid always uses it. */
function materialsOf(object) {
  return object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
}

function disposeTemplate(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  scene.traverse(object => {
    if (object.geometry && !object.isSprite) geometries.add(object.geometry);
    for (const material of materialsOf(object)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    if (texture.source?.data?.close) images.add(texture.source.data);
    texture.dispose();
  }
  for (const image of images) image.close();
}

export function createCarAssetCache({ descriptors, parse, createFactory, maxTemplates = 3 }) {
  if (!Number.isInteger(maxTemplates) || maxTemplates < 2) throw Error('Car cache requires room for starter and selected car');
  const catalog = new Map(descriptors.map(descriptor => [descriptor.id, descriptor]));
  if (catalog.size !== descriptors.length || !catalog.has('starter')) throw Error('Car catalog must have unique IDs and a starter');
  const ready = new Map(), pending = new Map();
  let clock = 0, queue = Promise.resolve();
  const trim = protectedId => {
    while (ready.size > maxTemplates) {
      const candidates = [...ready.values()].filter(entry => entry.id !== 'starter' && entry.id !== protectedId && !entry.references);
      candidates.sort((a, b) => a.used - b.used);
      if (!candidates.length) return; // Never destroy an in-use mesh to meet an LRU count.
      const victim = candidates[0]; ready.delete(victim.id); disposeTemplate(victim.scene);
    }
  };
  const prepare = (id, { isCurrent = () => true } = {}) => {
    if (!catalog.has(id)) return Promise.reject(Error('Unknown car ID: ' + id));
    if (!isCurrent()) return Promise.resolve({ status: 'stale', carId: id });
    if (ready.has(id)) { ready.get(id).used = ++clock; return Promise.resolve({ status: 'ready', carId: id }); }
    if (pending.has(id)) { pending.get(id).consumers.push(isCurrent); return pending.get(id).promise; }
    const task = { consumers: [isCurrent] };
    task.promise = queue.then(async () => {
      if (!task.consumers.some(current => current())) return { status: 'stale', carId: id };
      const descriptor = catalog.get(id), scene = await parse(descriptor);
      // Decoding may finish after a map/selection change. Do not insert that
      // abandoned scene: it could evict the owned model which loadMap has
      // prepared but not yet instantiated while a locked preview is visible.
      if (!task.consumers.some(current => current())) {
        disposeTemplate(scene); return { status: 'stale', carId: id };
      }
      let factory;
      try { factory = createFactory(descriptor, scene); }
      catch (error) { disposeTemplate(scene); throw error; }
      ready.set(id, { id, scene, factory, references: 0, used: ++clock });
      trim(id);
      return { status: 'ready', carId: id };
    });
    pending.set(id, task);
    const removePending = () => { if (pending.get(id) === task) pending.delete(id); };
    task.promise.then(removePending, removePending);
    queue = task.promise.catch(() => {});
    return task.promise;
  };
  const instantiate = (id, skin) => {
    const entry = ready.get(id);
    if (!entry) throw Error('Car asset not ready: ' + id);
    const asset = entry.factory.instantiate(skin), privateMaterials = new Set(), sharedGeometries = new Set();
    for (const root of [asset.body, ...asset.wheels.map(wheel => wheel.steer)]) root.traverse(object => {
      if (object.geometry) sharedGeometries.add(object.geometry);
      for (const material of materialsOf(object)) privateMaterials.add(material);
    });
    entry.references++; entry.used = ++clock;
    let released = false;
    const release = () => {
      if (released) return; released = true;
      for (const material of privateMaterials) material.dispose();
      entry.references--; trim();
    };
    return { ...asset, privateMaterials, sharedGeometries, release };
  };
  return { prepare, instantiate, isReady: id => ready.has(id) };
}

const disposedModels = new WeakSet();
/** Native dot/tag textures are cached by textures.js; sprites also share their
 * geometry. Dispose instance effects/materials without touching those caches
 * or the asset geometry/textures shared with another racer. */
export function disposeCarModel(model) {
  if (!model || disposedModels.has(model)) return;
  disposedModels.add(model);
  const data = model.userData, geometries = new Set(), materials = new Set();
  model.traverse(object => {
    if (object.geometry && !object.isSprite && !data.assetGeometries?.has(object.geometry)) geometries.add(object.geometry);
    for (const material of materialsOf(object)) if (!data.assetMaterials?.has(material)) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  data.assetRelease?.();
}
