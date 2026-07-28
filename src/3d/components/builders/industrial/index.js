import { registerConveyor } from "./conveyor";
import { registerRobotArm } from "./robot-arm";
import { registerCncMachine } from "./cnc-machine";
import { registerPress } from "./press";
function registerIndustrialComponents(registry) {
  registerConveyor(registry);
  registerRobotArm(registry);
  registerCncMachine(registry);
  registerPress(registry);
}
export {
  registerIndustrialComponents
};
