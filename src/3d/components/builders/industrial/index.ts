import { ComponentRegistry } from '../../registry'
import { registerConveyor } from './conveyor'
import { registerRobotArm } from './robot-arm'
import { registerCncMachine } from './cnc-machine'
import { registerPress } from './press'

export function registerIndustrialComponents(registry: typeof ComponentRegistry): void {
  registerConveyor(registry)
  registerRobotArm(registry)
  registerCncMachine(registry)
  registerPress(registry)
}
