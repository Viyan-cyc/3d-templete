import * as THREE from "three";
function registerCncMachine(registry) {
  registry.registerBuilder("cnc-machine", buildCncMachine);
}
function buildCncMachine(params, material, pool) {
  const width = Number(params.width) > 0 ? Number(params.width) : 1;
  const height = Number(params.height) > 0 ? Number(params.height) : 1;
  const depth = Number(params.depth) > 0 ? Number(params.depth) : 1;
  const group = new THREE.Group();
  const geo = pool.getGeometry(
    `cnc-machine:placeholder:${width},${height},${depth}`,
    () => new THREE.BoxGeometry(width, height, depth)
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
export {
  registerCncMachine
};
