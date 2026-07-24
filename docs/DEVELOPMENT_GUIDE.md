# 3D 场景开发文档

> 本文档面向 **3D 引擎开发者**——需要在本工程中添加新组件、新材质、新交互逻辑的开发人员。
> 如果你只是想把 3D 场景集成到自己的产品里，请阅读 [集成文档](./INTEGRATION_GUIDE.md)。

---

## 目录

1. [工程总览](#1-工程总览)
2. [目录结构](#2-目录结构)
3. [核心数据流](#3-核心数据流)
4. [添加新组件（Builder）](#4-添加新组件builder)
5. [添加新业务 Handler](#5-添加新业务-handler)
6. [使用外部模型（GLB/GLTF）](#6-使用外部模型glbglft)
7. [材质系统](#7-材质系统)
8. [交互系统](#8-交互系统)
9. [卡片系统（CSS2D）](#9-卡片系统css2d)
10. [增量更新（upsert/remove）](#10-增量更新upsertremove)
11. [3d-components 桥接](#11-3d-components-桥接)
12. [开发规范与约定](#12-开发规范与约定)

---

## 1. 工程总览

本工程是一个 **数据驱动** 的 3D 场景引擎，核心思想：

```
LiveDataConfig (JSON)  →  liveDataLoader 解析  →  Three.js 场景  →  CSS2D 卡片层
```

- **输入**：一份 `LiveDataConfig` JSON（声明场景里有哪些物体、长什么样、怎么组织层级）
- **输出**：一个完整的 Three.js 场景 + CSS2D 信息卡片
- **增量**：运行时可通过 `handle.update(patch)` 按物体 id 做 **增/删/改**

引擎循环、PMREM 环境光、OrbitControls、相机生命周期、CSS2D 渲染、resize、dispose 全部封装在 `createScene3D` 中，业务方无需感知。

---

## 2. 目录结构

```
src/3d/
├── index.ts                    # 统一出口，导出所有公共 API
├── createScene3D.ts            # 主入口函数 createScene3D()
├── App3D.ts                    # WebGL 渲染引擎封装（renderer/scene/camera/RAF）
├── types.ts                    # 核心类型（SceneConfig, CardDef, Vector3Like）
│
├── cards/                      # 卡片 UI 层（Vue + CSS2D）
│   ├── CardHost.vue            # 卡片宿主组件（Teleport 到 CSS2DObject 的 DOM）
│   └── types.ts                # CardState 运行时类型
│
├── components/                 # 3D 组件：构建器 + 注册表 + 缓存
│   ├── index.ts                # 统一出口 + registerAllBuilders()
│   ├── registry.ts             # ComponentRegistry（builder/ctor 双轨注册）
│   ├── AssetPool.ts            # 几何/材质缓存池（同参数共享实例）
│   ├── Shelf.ts                # 旧版类构造器示例
│   ├── SolarPanel.ts           # 旧版类构造器示例
│   └── builders/               # 新版函数构建器
│       ├── common/             # 通用：cabinet, desk, partition, signage
│       ├── warehouse/          # 仓储：bin, bookshelf, pallet, rack, showcase
│       ├── industrial/         # 工业：cnc-machine, conveyor, press, robot-arm
│       └── port/               # 港口：container, crane, dock, forklift
│
├── interaction/                # 交互
│   └── picker.ts               # 编辑态拾取器（ScenePicker，仅 interactive:true）
│
├── library/                    # 3d-components 桥接
│   └── library-bridge.ts       # @cyc/3d-components 的 name→Ctor 映射
│
├── loaders/                    # 资产加载
│   └── AssetLoader.ts          # GLTFLoader 封装
│
├── managers/                   # 管理器
│   ├── card/                   # 卡片管理器
│   │   ├── CardManager.ts      # CSS2D 卡片生命周期 + 交互
│   │   └── CardRegistry.ts     # Vue 组件 → 卡片类型 的注册表
│   └── component/              # 业务组件管理器
│       ├── ComponentManager.ts # 操作×类型 二维分派（create/update/delete）
│       └── handlers/           # 业务 handler 实现
│           ├── index.ts        # 统一注册入口
│           ├── shared.ts       # 跨 handler 共享状态
│           ├── device.ts       # 设备状态 handler
│           ├── tree.ts         # 树 handler
│           └── wall.ts         # 墙 handler
│
├── models/                     # 模型加载
│   ├── registry.ts             # 本地模型注册表（Vite ?url 引用）
│   ├── loader.ts               # ModelLoader provider 链（asset/http/hunyuan）
│   └── hunyuan.ts              # 混元生成 provider
│
├── controls/                   # 相机控制
│   └── OrbitControls.ts        # OrbitControls 封装
│
├── debug/                      # 调试
│   └── DebugOverlay.ts         # HUD 面板（FPS/triangles/calls）
│
└── utils/                      # 工具
    ├── liveDataLoader.ts       # LiveDataConfig 解析器 + 物体工厂
    ├── sceneCards.ts           # 卡片命名扫描器（CardScanRule）
    └── sceneUpdate.ts          # 增量更新（upsertObjects/removeObjects/refreshCards）
```

---

## 3. 核心数据流

```
┌────────────────────────────────────────────────────────────────────┐
│  业务方                                                            │
│                                                                    │
│  ① fetch('/api/scene') → LiveDataConfig JSON                      │
│  ② cardRules: CardScanRule[]  ← 业务定义哪些物体挂什么卡片           │
│  ③ const handle = createScene3D(canvas, data, { cardRules })      │
│  ④ handle.onCardState(cb)   ← 接收卡片状态，喂给 <CardHost>        │
│  ⑤ handle.update(patch)     ← 运行时增量更新                       │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────────┐
│  createScene3D 内部流程                                             │
│                                                                    │
│  1. registerComponentHandlers()   ← 注册业务 handler               │
│  2. new App3D({ canvas })         ← WebGL 引擎                    │
│  3. applyLiveDataToApp(app, data) ← 解析 JSON → 构建场景树          │
│     ├─ createLiveObject3D()       ← resolver 链创建每个物体        │
│     │   ① component.name → library-bridge (3d-components)         │
│     │   ② component.type → ComponentRegistry (内置 builder)        │
│     │   ③ src → ModelLoader (外部模型占位)                         │
│     │   ④ geometry → createLiveMesh (原生几何体)                   │
│     │   ⑤ type:group → THREE.Group                                │
│     └─ ComponentManager.create()  ← handler 分派（可覆盖上述逻辑）  │
│  4. applyEnvironment()            ← PMREM 环境光                  │
│  5. createOrbitControls()         ← 轨道控制器                    │
│  6. CardManager.attach()          ← CSS2D 渲染层                  │
│  7. scanAndRegisterCards()        ← 按 cardRules 扫描并注册卡片     │
│  8. loadModelObjects()            ← 异步加载外部模型                │
│  9. 收集 IUpdatable → 渲染循环     ← 每帧 update 组件              │
│ 10. ScenePicker (interactive)     ← 编辑态拾取                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. 添加新组件（Builder）

### 4.1 Builder 是什么

Builder 是一个**纯函数**，接收参数 + 材质 + 缓存池，返回一个 `THREE.Group`。用于 `LiveDataConfig` 中 `component.type` 驱动的组件（如 rack、desk、cabinet 等）。

### 4.2 创建步骤

**第一步**：在 `src/3d/components/builders/` 下对应子目录新建文件。

例如新增一个 `conveyor-belt`（传送带），放在 `builders/industrial/` 下：

```ts
// src/3d/components/builders/industrial/conveyor-belt.ts

import * as THREE from 'three'
import { ComponentRegistry } from '../../registry'
import type { AssetPool } from '../../AssetPool'

/** Builder 参数类型 */
export type ConveyorBeltParams = {
  length?: number    // 传送带长度，默认 4
  width?: number     // 传送带宽度，默认 1
  height?: number    // 传送带高度，默认 0.5
  speed?: number     // 传送速度（视觉用），默认 1
}

/** 注册到 ComponentRegistry */
export function registerConveyorBelt(registry: typeof ComponentRegistry): void {
  registry.registerBuilder('conveyor-belt', buildConveyorBelt)
}

/** Builder 函数签名固定：(params, material, pool) => THREE.Group */
function buildConveyorBelt(
  params: Record<string, number | string>,
  material: THREE.Material,
  pool: AssetPool,
): THREE.Group {
  const length = Number(params.length) > 0 ? Number(params.length) : 4
  const width  = Number(params.width)  > 0 ? Number(params.width)  : 1
  const height = Number(params.height) > 0 ? Number(params.height) : 0.5

  const group = new THREE.Group()

  // ── 主带面 ──
  // 使用 pool.getGeometry 缓存：相同参数的几何体只创建一次
  const beltGeo = pool.getGeometry(
    `conveyorBelt:belt:${length},${width},${height}`,
    () => new THREE.BoxGeometry(length, height * 0.3, width),
  )
  const belt = new THREE.Mesh(beltGeo, material)
  belt.position.y = height * 0.85
  belt.castShadow = true
  group.add(belt)

  // ── 侧栏 ──
  const railGeo = pool.getGeometry(
    `conveyorBelt:rail:${length},${height}`,
    () => new THREE.BoxGeometry(length, height, width * 0.05),
  )
  const leftRail = new THREE.Mesh(railGeo, material)
  leftRail.position.set(0, height * 0.5, width * 0.5)
  group.add(leftRail)

  const rightRail = new THREE.Mesh(railGeo, material)
  rightRail.position.set(0, height * 0.5, -width * 0.5)
  group.add(rightRail)

  return group
}
```

**第二步**：在子目录的 `index.ts` 中导出注册函数。

```ts
// src/3d/components/builders/industrial/index.ts
export { registerConveyorBelt } from './conveyor-belt'
```

**第三步**：在 `registerIndustrialComponents`（或对应的注册函数）中加入调用。

```ts
// src/3d/components/builders/industrial/index.ts（或对应文件）
import { ComponentRegistry } from '../../registry'
import { registerConveyorBelt } from './conveyor-belt'

export function registerIndustrialComponents(registry: typeof ComponentRegistry): void {
  // ... 已有的注册
  registerConveyorBelt(registry)   // ← 新增这行
}
```

**第四步**：在 `LiveDataConfig` 的 JSON 中使用。

```json
{
  "id": "conveyor01",
  "type": "component",
  "parentId": "factoryZone",
  "component": {
    "type": "conveyor-belt",
    "params": { "length": 6, "width": 1.2, "height": 0.6 }
  },
  "material": { "type": "standard", "color": "#888888", "roughness": 0.6, "metalness": 0.3 },
  "position": [10, 0, 5]
}
```

### 4.3 Builder 接口签名

```ts
type ComponentBuilder = (
  params: Record<string, number | string>,  // 来自 JSON 的 component.params
  material: THREE.Material,                  // 来自 JSON 的 material（已解析）
  pool: AssetPool,                           // 几何/材质缓存池
) => THREE.Group
```

**关键约定**：
- 必须返回 `THREE.Group`（不是 `THREE.Mesh`）
- 子 mesh 的 `name` 会被自动设为 `${parentId}_${child.name}`，供 `parentId` 引用和 raycast 识别
- 使用 `pool.getGeometry(key, factory)` 缓存几何体，避免同参数重复创建
- 使用传入的 `material` 而不是自行 new，保持数据驱动一致性

---

## 5. 添加新业务 Handler

### 5.1 Handler 是什么

Handler 是 **操作 × 类型** 的二维分派器，挂在 `ComponentManager` 上。当一个 `LiveDataObject` 属于特定业务类型时，走该类型注册的 handler；否则回落到默认逻辑。

与 Builder 的区别：
- **Builder** 只管"怎么构建形状"，纯几何
- **Handler** 管"创建 + 更新 + 删除"全生命周期，可以加业务逻辑（状态变色、动画、特效等）

### 5.2 创建步骤

**第一步**：在 `src/3d/managers/component/handlers/` 下新建文件。

```ts
// src/3d/managers/component/handlers/agv.ts

import * as THREE from 'three'
import type { ComponentHandler, ComponentContext } from '../ComponentManager'
import { createLiveObject3D } from '../../../utils/liveDataLoader'
import type { LiveDataObject } from '../../../utils/liveDataLoader'

export const agvHandler: ComponentHandler = {
  /**
   * 创建：可以完全自定义，也可以先调 createLiveObject3D 再增强。
   * 返回 null 则回落到默认逻辑。
   */
  create(data: LiveDataObject, ctx: ComponentContext) {
    // 复用默认创建逻辑
    const obj = createLiveObject3D(data)
    if (!obj) return null

    // 增强：按 AGV 状态染色
    const status = data.component?.params?.status as string | undefined
    if (status) {
      applyAgvStatus(obj, status, ctx)
    }

    return obj
  },

  /**
   * 更新：运行时 handle.update() 触发。
   * 返回 true 表示已处理，false 回落默认 patchObject。
   */
  update(obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) {
    // 移动：应用新 position
    if (data.position) {
      obj.position.set(data.position[0], data.position[1], data.position[2])
    }

    // 状态变色
    const status = data.component?.params?.status as string | undefined
    if (status) {
      applyAgvStatus(obj, status, ctx)
    }

    return true  // 已处理，不回落默认
  },

  /**
   * 删除：handle.update({ remove: [...] }) 触发。
   * 返回 true 表示已处理，false 回落默认 disposeObject。
   */
  delete(obj: THREE.Object3D, _ctx: ComponentContext) {
    // 自定义清理（如停止动画、释放特效等）
    // ...
    return false  // 回落默认 dispose（traverse dispose geometry/material）
  },
}

function applyAgvStatus(obj: THREE.Object3D, status: string, ctx: ComponentContext) {
  const colors: Record<string, string> = {
    idle: '#4CAF50',
    moving: '#2196F3',
    charging: '#FF9800',
    error: '#F44336',
  }
  const color = colors[status] ?? '#888888'
  const mat = ctx.shared.getMaterial(color, 0.4, 0.3)

  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      const old = mesh.material
      if (Array.isArray(old)) old.forEach((m) => m.dispose())
      else old?.dispose()
      mesh.material = mat
    }
  })
}
```

**第二步**：在 `handlers/index.ts` 注册。

```ts
// src/3d/managers/component/handlers/index.ts

import { componentManager } from '../ComponentManager'
import { sharedState } from './shared'
import { deviceHandler } from './device'
import { treeHandler } from './tree'
import { wallHandler } from './wall'
import { agvHandler } from './agv'          // ← 新增 import

export function registerComponentHandlers(): void {
  componentManager.registerAll([
    ['device', deviceHandler],
    ['tree', treeHandler],
    ['Wall', wallHandler],
    ['agv', agvHandler],                     // ← 新增注册
  ])
}
```

### 5.3 Handler 接口

```ts
interface ComponentHandler {
  create?: (data: LiveDataObject, ctx: ComponentContext) => THREE.Object3D | null
  update?: (obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) => boolean
  delete?: (obj: THREE.Object3D, ctx: ComponentContext) => boolean
}

interface ComponentContext {
  scene: THREE.Scene
  index: ObjectIndex                    // id → Object3D 的全局索引
  shared: ComponentSharedState          // 跨 handler 共享状态
}
```

**类型匹配规则**：`component.name` > `component.type`，与 resolver 链一致。

```json
// 匹配 handler 'agv' 的两种写法：
{ "component": { "type": "agv" } }            // 走 agvHandler
{ "component": { "name": "AGV", "type": "agv" } }  // name 优先 → 先走 library-bridge，未命中再走 agvHandler
```

### 5.4 共享状态

所有 handler 通过 `ctx.shared` 访问同一个 `ComponentSharedState` 实例，可用于：

- `ctx.shared.deviceStatusColors` — 状态→颜色映射（可运行时修改）
- `ctx.shared.seasonColors` — 季节→颜色映射
- `ctx.shared.getMaterial(color, roughness, metalness)` — 缓存材质
- `ctx.shared.selectedComponentId` — 当前选中实体 id
- `ctx.shared.store` — 自由 key-value 存储

新增共享字段：在 `src/3d/managers/component/handlers/shared.ts` 的 `ComponentSharedState` 类中添加属性即可。

---

## 6. 使用外部模型（GLB/GLTF）

### 6.1 模型加载机制

模型走 `ModelLoader` provider 链，按 `src` 前缀路由：

| 前缀 | Provider | 说明 |
|------|----------|------|
| `asset:xxx` | assetProvider | 本地 `modelRegistry` + GLTFLoader |
| `https://...` | httpProvider | 远程 URL + GLTFLoader |
| `hunyuan:xxx` | hunyuanProvider | 混元 AI 生成（单次缓存） |

所有 provider 内置**原型缓存 + clone(true)** 复用：同一 URL 只 parse 一次，后续实例 clone。

### 6.2 在 JSON 中引用模型

```json
{
  "id": "windmill01",
  "type": "glb",
  "parentId": "farmZone",
  "src": "asset:windmill",
  "position": [10, 0, 5],
  "castShadow": true,
  "receiveShadow": true
}
```

加载流程：
1. `applyLiveDataToApp` 阶段创建**占位 Group**（空壳，占住位置和层级）
2. 渲染循环已启动
3. `loadModelObjects()` 异步加载，填充到占位 Group 中
4. 加载失败 → 放一个红色 box 兜底，不阻塞其余物体

### 6.3 注册本地模型

在 `src/3d/models/registry.ts` 中添加条目：

```ts
// 利用 Vite ?url 导入，构建时自动 hash
import windmillUrl from '/public/models/windmill.glb?url'

export const modelRegistry: Record<string, string> = {
  windmill: windmillUrl,
  // 新增模型在这里加
}
```

模型文件放在 `public/models/` 目录下。

---

## 7. 材质系统

### 7.1 LiveDataMaterial 类型

```ts
interface LiveDataMaterial {
  type: 'standard' | 'phong' | 'basic' | 'physical'
  color?: string              // hex 颜色，如 '#ff4444'
  roughness?: number          // 粗糙度 0-1
  metalness?: number          // 金属度 0-1
  transparent?: boolean       // 是否透明
  opacity?: number            // 透明度 0-1（transparent:true 时生效）
  // physical 专属
  transmission?: number       // 透射率（玻璃效果）
  ior?: number                // 折射率
  thickness?: number          // 厚度
  clearcoat?: number          // 清漆层
  clearcoatRoughness?: number // 清漆粗糙度
  sheen?: number              // 光泽
  sheenColor?: string         // 光泽颜色
  map?: string                // 纹理贴图路径
}
```

### 7.2 材质缓存

`AssetPool` 对材质做缓存：相同参数（type + color + roughness + metalness + transparent + opacity + transmission + clearcoat + ior）共享同一个 `Material` 实例。无需手动管理。

### 7.3 在 JSON 中写材质

```json
// 普通漫反射
{ "type": "standard", "color": "#e0e0e0", "roughness": 0.7, "metalness": 0.1 }

// 半透明
{ "type": "standard", "color": "#2a5ad9", "transparent": true, "opacity": 0.15 }

// 玻璃
{ "type": "physical", "color": "#ffffff", "roughness": 0, "metalness": 0, "transmission": 0.9, "ior": 1.5, "thickness": 0.5 }

// 自发光（不响应光照）
{ "type": "basic", "color": "#fff8dc" }
```

### 7.4 在代码中动态换材质

在 handler 的 `update` 中：

```ts
update(obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) {
  if (data.material) {
    // 方式 1：用 ctx.shared 的缓存材质
    const mat = ctx.shared.getMaterial(data.material.color!, data.material.roughness, data.material.metalness)
    applyMaterialToTree(obj, mat)

    // 方式 2：用 liveDataLoader 的材质工厂（带 AssetPool 缓存）
    // import { createLiveMaterial } from '../../../utils/liveDataLoader'
    // const mat = createLiveMaterial(data.material)
  }
  return true
}
```

---

## 8. 交互系统

### 8.1 运行态交互（CSS2D 卡片点击）

在 `createScene3D` 默认模式（`interactive: false`）下：
- 点击 3D 物体 → 射线检测 → 命中卡片 → 显示/隐藏卡片
- 同组互斥：同一 `interactiveGroup` 内只显示一张卡片
- 点击空白处 → 隐藏所有 click 模式卡片

此交互由 `CardManager` 自动处理，不需要额外开发。

### 8.2 编辑态交互（ScenePicker）

当 `interactive: true` 时启用 `ScenePicker`：

```ts
const handle = await createScene3D(canvas, data, { interactive: true })

// 设置拾取回调
handle.picker!.onPick = (info) => {
  console.log('选中物体:', info.id, info.name)
}

// 启用/禁用拾取
handle.picker!.enable()
handle.picker!.disable()

// 切换选中粒度
handle.picker!.setGranularity('part')   // 部件级（如点中树干）
handle.picker!.setGranularity('whole')  // 整体级（如选中整棵树）

// 飞到某物体
handle.flyTo!('building01')

// 切换主题
handle.setTheme!('dark')

// 复位相机
handle.resetCamera!()
```

### 8.3 物体标识约定

所有由 `liveDataLoader` 创建的物体都在 `userData.__id` 中写入 JSON 中的 `id`：

```ts
// ScenePicker 内部：沿父子链向上查找 __id
let cur = hit.object
while (cur) {
  const id = cur.userData?.__id
  if (id) { /* 命中 */ break }
  cur = cur.parent
}
```

此外还有：
- `userData.__zone` — 分区标记（ScenePicker whole 模式使用）
- `userData.__logicalRoot` — 逻辑物体根标记（一棵树/一张桌子等整体）
- `userData.__componentType` — 组件类型标记（ComponentManager delete 分派使用）
- `userData.__updatable` — IUpdatable 标记（有 `update(delta)` 方法的组件）

---

## 9. 卡片系统（CSS2D）

### 9.1 卡片流程

```
JSON 中物体 id  →  CardScanRule.pattern 匹配  →  分组  →  CardManager.addCard()
                                                            ↓
                                                     CSS2DObject 挂到锚点
                                                            ↓
                                                     CardState[] → Vue <CardHost>
                                                            ↓
                                                     Teleport 到 CSS2DObject 的 DOM
                                                            ↓
                                                     <component :is="cardComponent" v-bind="props" />
```

### 9.2 创建新卡片 Vue 组件

```vue
<!-- src/cards/DeviceCard.vue -->
<template>
  <div class="device-card">
    <h4>{{ name }}</h4>
    <p>状态: {{ status }}</p>
    <p>温度: {{ temperature }}°C</p>
  </div>
</template>

<script setup lang="ts">
// 卡片组件接收的 props 由 CardScanRule.props 派生
defineProps<{
  cardId: string     // 卡片 id（自动注入）
  objectId: string   // 关联的 3D 物体 id（自动注入）
  name?: string      // 业务自定义 props
  status?: string
  temperature?: number
}>()
</script>

<style scoped>
.device-card {
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  pointer-events: auto;
  min-width: 120px;
}
</style>
```

### 9.3 注册卡片组件 + 定义扫描规则

卡片注册和扫描规则绑定在一起，在 `CardScanRule` 中声明：

```ts
// 业务方代码（如 Scene3D.vue 或 sceneCardRules.ts）
import { type CardScanRule } from '@/3d'
import DeviceCard from './cards/DeviceCard.vue'
import TreeCard from './cards/TreeCard.vue'

export const cardRules: CardScanRule[] = [
  {
    type: 'device',                        // 卡片类型名
    component: DeviceCard,                 // Vue 组件（传入即自动注册，无需手动 register）
    pattern: /^(device\d+)_/,             // 匹配 mesh.name，捕获组 [1] = 分组 id
    anchor: 'highest',                     // 锚点：取 y 最高的 mesh
    offset: [0, 1.2, 0],                   // 卡片偏移
    interactiveGroup: 'scene',             // 交互分组
    props: (group) => ({                   // 从分组派生 props
      name: group.id,
      status: 'running',
      temperature: 42,
    }),
  },
  {
    type: 'tree',
    component: TreeCard,
    pattern: /^(tree\d+)_/,
    anchor: 'highest',
    offset: [0, 0.8, 0],
    props: (group) => ({
      name: group.id,
      species: 'Oak',
    }),
  },
]
```

### 9.4 CardScanRule 详解

```ts
interface CardScanRule {
  type: string               // 卡片类型，对应 cardComponentRegistry 中的 key
  component?: Component      // Vue 组件（传入即自动注册）
  pattern: RegExp            // 匹配 mesh.name；捕获组 [1] = 分组 id
  anchor?: CardAnchorSpec    // 锚点选取方式
  offset?: [number, number, number]  // 卡片相对锚点偏移，默认 [0, 0.6, 0]
  interactiveGroup?: string  // 交互分组（同组互斥），不填则所有卡片共用
  props?: (group: CardScanGroup) => Record<string, unknown>  // 派生 props
}

type CardAnchorSpec =
  | 'highest'    // 取 position.y 最大的 mesh
  | 'first'      // 取 meshes[0]（默认）
  | string       // 取 name 以该后缀结尾的 mesh（如 '_body'），找不到回退 first
  | ((meshes: THREE.Object3D[]) => THREE.Object3D)  // 完全自定义

interface CardScanGroup {
  id: string                   // 分组 id
  meshes: THREE.Object3D[]     // 该分组的全部关联 mesh
  anchor: THREE.Object3D       // 选出的锚点物体
}
```

### 9.5 卡片显隐模式

在 `CardDef` 中控制：

```ts
interface CardDef {
  mode?: 'always' | 'click'   // always=常显，click=点击显示/隐藏（默认 click）
  interactiveGroup?: string    // 同组互斥
  alwaysVisible?: boolean      // 等价于 mode:'always'
  offset?: [number, number, number]
  props?: Record<string, unknown>
}
```

---

## 10. 增量更新（upsert/remove）

### 10.1 update 接口

```ts
interface SceneUpdatePatch {
  objects?: {
    upsert?: LiveDataObject[]  // 按 id 增/改
    remove?: string[]          // 按 id 删除
  }
}

// 使用
handle.update({
  objects: {
    upsert: [
      { id: 'agv01', position: [10, 0, 5], component: { type: 'agv', params: { status: 'moving' } } },
    ],
    remove: ['tempObj01'],
  },
})
```

### 10.2 upsert 逻辑

- **id 已存在**：就地补丁（transform/material/geometry），保留 Object3D 身份，不重建不闪烁
- **id 不存在**：创建新 Object3D 并挂到父节点

更新会通过 `ComponentManager` 分派：如果该类型有 handler 且 handler.update 返回 true，走 handler 逻辑；否则回落默认 `patchObject`。

### 10.3 卡片同步

upsert/remove 后自动调用 `refreshCards`：
1. 从变更的 object name 中提取受影响的卡片分组 id
2. 移除受影响的卡片
3. 重新扫描场景并注册（未受影响的卡片 addCard 会跳过，因为 id 已存在）

---

## 11. 3d-components 桥接

### 11.1 什么是 3d-components

`@cyc/3d-components` 是独立的 3D 组件库，提供 Grid、Wall、HeatMesh、Sky 等 `THREE.Object3D` 子类。

### 11.2 使用方式

在 JSON 中通过 `component.name` 引用：

```json
{
  "id": "heatMap01",
  "type": "component",
  "parentId": "centralZone",
  "component": {
    "name": "HeatMesh",
    "options": { "width": 10, "height": 10, "segments": 50 }
  },
  "position": [0, 0.1, 0],
  "rotation": [-90, 0, 0]
}
```

`component.name` 在 resolver 链中优先级最高，会走 `library-bridge` → `new HeatMesh(options)`。

### 11.3 IUpdatable

3d-components 中的某些组件（如 HeatMesh）实现了 `update(delta)` 方法。`library-bridge` 在创建时会检测并在 `userData.__updatable` 标记，`createScene3D` 会将其注册到渲染循环，每帧调用 `update(delta)`。

### 11.4 新增 3d-components 组件

如果在 `@cyc/3d-components` 包中新增了组件类（首字母大写的 Object3D 子类），`library-bridge` 会自动注册——`initLibraryBridge()` 通过 `registerNamespace()` 扫描包中所有首字母大写的 Object3D 子类，无需手动添加映射。

---

## 12. 开发规范与约定

### 12.1 命名约定

| 对象 | 约定 | 示例 |
|------|------|------|
| JSON 物体 id | camelCase，语义化 | `chubGround`, `sbdTree1Group` |
| Builder type | kebab-case | `conveyor-belt`, `robot-arm` |
| Handler type | camelCase | `device`, `agv`, `Wall` |
| Card type | camelCase | `device`, `tree` |
| mesh.name | 等于 JSON id | `chubGround` |
| 子 mesh.userData.id | `${parentId}_${child.name}` | `sbdTree1_Trunk` |

### 12.2 Resolver 链优先级

```
component.name (3d-components)  >  component.type (内置 builder)  >  src (模型)  >  geometry (原生 mesh)  >  group
```

写 JSON 时注意：
- 如果 `component.name` 命中 library-bridge，优先走 3d-components，`component.type` 和 `src` 被忽略
- 如果 `component.name` 未命中，回退到 `component.type` 走内置 builder
- 如果 `component.type` 也未命中，回退到 `src` 走模型加载
- 如果 `src` 也没有，回退到 `geometry` 走原生 mesh

### 12.3 新增文件清单

| 新增什么 | 需要改的文件 |
|----------|-------------|
| 新 Builder | `builders/xxx/newComponent.ts` + `builders/xxx/index.ts` 注册 |
| 新 Handler | `handlers/newHandler.ts` + `handlers/index.ts` 注册 |
| 新模型资产 | `public/models/xxx.glb` + `models/registry.ts` 注册 |
| 新卡片组件 | 业务方 Vue 组件 + `CardScanRule` 声明 |
| 新 3d-components 组件 | `@cyc/3d-components` 包内开发，无需改本工程 |

### 12.4 性能注意

- 几何体/材质务必走 `AssetPool` 或 `ctx.shared.getMaterial()` 缓存，同参数不重复创建
- 外部模型走原型缓存 + clone，同一 URL 只 parse 一次
- `IUpdatable` 组件的 `update(delta)` 应避免每帧 GC，复用对象
- 大场景中避免 `scene.traverse()` 热路径，用 `ObjectIndex`（id → Object3D Map）O(1) 查找
