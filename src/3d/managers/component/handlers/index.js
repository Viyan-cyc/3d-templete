import { componentManager } from "../ComponentManager";
import { sharedState } from "./shared";
import { deviceHandler } from "./device";
import { treeHandler } from "./tree";
import { wallHandler } from "./wall";
import { sharedState as sharedState2, ComponentSharedState } from "./shared";
function registerComponentHandlers() {
  componentManager.registerAll([
    ["device", deviceHandler],
    ["tree", treeHandler],
    ["Wall", wallHandler]
    // 新增类型在这里加一行即可
  ]);
}
function disposeComponentHandlers() {
  sharedState.dispose();
}
export {
  ComponentSharedState,
  disposeComponentHandlers,
  registerComponentHandlers,
  sharedState2 as sharedState
};
