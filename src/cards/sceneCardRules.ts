/**
 * 业务侧卡片定义 —— 从 3d 包里迁出的 demo 配置。
 *
 * 一条规则 = 卡片类型 + Vue 组件 + 命名扫描规则 + 锚点 + props，
 * 全部声明在一处。scanAndRegisterCards 会自动注册组件并按 pattern 分组。
 * 换成货架/AGV/光伏等场景时，业务方改这个文件即可。
 */

import type { CardScanRule } from '@/3d'
import InfoCard from '@/components/cards/InfoCard.vue'

const groupHeight = (meshes: { position: { y: number } }[]): number =>
  meshes.reduce((mx, m) => Math.max(mx, m.position.y), 0)

export const cardRules: CardScanRule[] = [
  {
    type: 'tree',
    component: InfoCard,
    pattern: /^(tree\d+)_/, // tree01_trunk / tree01_canopy ... → id=tree01
    anchor: 'highest', // 卡片飘在树顶
    offset: [0, 0.6, 0],
    interactiveGroup: 'scene', // 全局互斥：同时只显示一张卡片
    props: ({ id, anchor, meshes }) => ({
      kind: 'tree' as const,
      label: `树 ${id.replace(/^tree/, '').padStart(2, '0')}`,
      position: [anchor.position.x, anchor.position.z] as [number, number],
      height: groupHeight(meshes),
    }),
  },
  {
    type: 'building',
    component: InfoCard,
    pattern: /^(building[A-Z])_/, // buildingA_body / buildingA_window ... → id=buildingA
    anchor: '_body', // 锚点取 *_body，找不到回退第一个 mesh
    offset: [0, 0.6, 0],
    interactiveGroup: 'scene',
    props: ({ id, anchor, meshes }) => ({
      kind: 'building' as const,
      label: `建筑 ${id.replace(/^building/, '')}`,
      position: [anchor.position.x, anchor.position.z] as [number, number],
      height: groupHeight(meshes),
    }),
  },
]
