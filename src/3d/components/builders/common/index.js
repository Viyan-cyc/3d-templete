import { registerDesk } from "./desk";
import { registerCabinet } from "./cabinet";
import { registerPartition } from "./partition";
import { registerSignage } from "./signage";
function registerCommonComponents(registry) {
  registerDesk(registry);
  registerCabinet(registry);
  registerPartition(registry);
  registerSignage(registry);
}
export {
  registerCommonComponents
};
