import { createLiveObject3D } from "../../../utils/liveDataLoader";
const treeHandler = {
  create(data, _ctx) {
    const obj = createLiveObject3D(data);
    if (!obj) return null;
    const season = data.component?.params?.season;
    if (season) {
      applySeasonMaterial(obj, season, _ctx);
    }
    return obj;
  },
  update(obj, data, ctx) {
    const season = data.component?.params?.season;
    if (season) {
      applySeasonMaterial(obj, season, ctx);
      return true;
    }
    return false;
  }
};
function applySeasonMaterial(obj, season, ctx) {
  const colors = ctx.shared.seasonColors;
  const color = colors[season] ?? "#4caf50";
  const mat = ctx.shared.getMaterial(color);
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
  treeHandler
};
