import { createLiveObject3D } from "../../../utils/liveDataLoader";
const deviceHandler = {
  create(data, _ctx) {
    const obj = createLiveObject3D(data);
    if (!obj) return null;
    const status = data.component?.params?.status;
    if (status) {
      applyDeviceStatus(obj, status, _ctx);
    }
    return obj;
  },
  update(obj, data, ctx) {
    const status = data.component?.params?.status;
    if (status) {
      applyDeviceStatus(obj, status, ctx);
      return true;
    }
    return false;
  }
};
function applyDeviceStatus(obj, status, ctx) {
  const colors = ctx.shared.deviceStatusColors;
  const color = colors[status] ?? "#888888";
  const mat = ctx.shared.getMaterial(color, 0.5, 0.3);
  obj.traverse((child) => {
    if (child.isMesh) {
      const mesh = child;
      const old = mesh.material;
      if (Array.isArray(old)) old.forEach((m) => m.dispose());
      else old?.dispose();
      mesh.material = mat;
    }
  });
}
export {
  deviceHandler
};
