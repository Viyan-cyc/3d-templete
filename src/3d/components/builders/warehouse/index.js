import { registerRack } from "./rack";
import { registerBookshelf } from "./bookshelf";
import { registerShowcase } from "./showcase";
import { registerPallet } from "./pallet";
import { registerBin } from "./bin";
function registerWarehouseComponents(registry) {
  registerRack(registry);
  registerBookshelf(registry);
  registerShowcase(registry);
  registerPallet(registry);
  registerBin(registry);
}
export {
  registerWarehouseComponents
};
