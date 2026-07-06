import { ComponentRegistry } from '../ComponentRegistry'
import { registerContainer } from './container'
import { registerCrane } from './crane'
import { registerForklift } from './forklift'
import { registerDock } from './dock'

export function registerPortComponents(registry: typeof ComponentRegistry): void {
  registerContainer(registry)
  registerCrane(registry)
  registerForklift(registry)
  registerDock(registry)
}
