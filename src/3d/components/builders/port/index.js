import { registerContainer } from "./container";
import { registerCrane } from "./crane";
import { registerForklift } from "./forklift";
import { registerDock } from "./dock";
function registerPortComponents(registry) {
  registerContainer(registry);
  registerCrane(registry);
  registerForklift(registry);
  registerDock(registry);
}
export {
  registerPortComponents
};
