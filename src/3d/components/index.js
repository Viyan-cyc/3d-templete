import { ComponentRegistry } from "./registry";
import { AssetPool } from "./AssetPool";
import { Shelf } from "./Shelf";
import { SolarPanel } from "./SolarPanel";
import { ComponentRegistry as ComponentRegistry2 } from "./registry";
import { registerWarehouseComponents } from "./builders/warehouse";
import { registerIndustrialComponents } from "./builders/industrial";
import { registerPortComponents } from "./builders/port";
import { registerCommonComponents } from "./builders/common";
function registerAllBuilders() {
  registerWarehouseComponents(ComponentRegistry2);
  registerIndustrialComponents(ComponentRegistry2);
  registerPortComponents(ComponentRegistry2);
  registerCommonComponents(ComponentRegistry2);
}
export {
  AssetPool,
  ComponentRegistry,
  Shelf,
  SolarPanel,
  registerAllBuilders
};
