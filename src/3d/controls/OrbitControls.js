import { OrbitControls as _OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
function createOrbitControls(camera, domElement, options) {
  const controls = new _OrbitControls(camera, domElement);
  controls.enableDamping = options?.enableDamping ?? true;
  controls.dampingFactor = options?.dampingFactor ?? 0.08;
  controls.minDistance = options?.minDistance ?? 2;
  controls.maxDistance = options?.maxDistance ?? 1e3;
  controls.maxPolarAngle = options?.maxPolarAngle ?? Math.PI / 2.1;
  if (options?.target) {
    controls.target.set(options.target.x, options.target.y, options.target.z);
  }
  return controls;
}
export {
  createOrbitControls
};
