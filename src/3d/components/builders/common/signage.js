import * as THREE from "three";
function registerSignage(registry) {
  registry.registerBuilder("signage", buildSignage);
}
function buildSignage(params, material, pool) {
  const width = Number(params.width) > 0 ? Number(params.width) : 1;
  const height = Number(params.height) > 0 ? Number(params.height) : 1;
  const depth = Number(params.depth) > 0 ? Number(params.depth) : 1;
  const group = new THREE.Group();
  const geo = pool.getGeometry(
    `signage:placeholder:${width},${height},${depth}`,
    () => new THREE.BoxGeometry(width, height, depth)
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
export {
  registerSignage
};
