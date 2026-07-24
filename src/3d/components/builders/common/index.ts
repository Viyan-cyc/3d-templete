import { ComponentRegistry } from '../../registry'
import { registerDesk } from './desk'
import { registerCabinet } from './cabinet'
import { registerPartition } from './partition'
import { registerSignage } from './signage'

export function registerCommonComponents(registry: typeof ComponentRegistry): void {
  registerDesk(registry)
  registerCabinet(registry)
  registerPartition(registry)
  registerSignage(registry)
}
