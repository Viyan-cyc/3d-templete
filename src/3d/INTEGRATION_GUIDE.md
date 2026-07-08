# 3D 场景集成指南

> 本文档面向**产品开发团队**，指导如何快速将 `src/3d` 模块集成到你的 React 项目中，实现 3D 场景渲染与 2D 信息卡片交互。

---

## 一、整体架构概览

```
┌─────────────────────────────────────────────────────┐
│  产品方（你的代码）                                    │
│                                                       │
│  1. 准备场景数据 (LiveDataConfig JSON)                │
│  2. 编写 2D 卡片组件 (React Component)                  │
│  3. 声明卡片扫描规则 (CardScanRule[])                 │
│  4. 调用 createScene3D() 一行启动                     │
│                                                       │
└───────────────┬─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────┐
│  src/3d 模块（黑盒，无需关心内部实现）                  │
│                                                       │
│  - WebGL 渲染循环                                     │
│  - 相机 / 灯光 / 阴影 / IBL 环境                      │
│  - OrbitControls 轨道控制                              │
│  - CSS2D 卡片定位与交互                                │
│  - 增量更新（物体增删改）                               │
│  - 自动 resize / dispose                              │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**你只需要做 4 件事：**

1. 提供一个 `<canvas>` 元素
2. 传入场景数据（`LiveDataConfig` JSON）
3. 编写 2D 卡片 React 组件 + 声明扫描规则
4. 调用 `createScene3D()` 启动

---

## 二、5 分钟快速集成

### 2.1 安装依赖

```bash
npm install three
```

### 2.2 最小集成代码

```tsx
import React, { useRef, useState, useEffect } from 'react'
import {
  createScene3D,
  CardHost,
  type Scene3DHandle,
  type CardState,
} from '@/3d'
import { cardRules } from '@/cards/sceneCardRules'  // 你的卡片规则

const Scene3D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cardStates, setCardStates] = useState<CardState[]>([])
  const handleRef = useRef<Scene3DHandle | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    let disposed = false;

    (async () => {
      // 从你的接口获取场景数据
      const data = await fetch('/api/your-scene-endpoint').then(r => r.json())
      const handle = await createScene3D(canvas, data, { cardRules })
      if (disposed) { handle.dispose(); return }
      handle.onCardState(states => setCardStates(states))
      handleRef.current = handle
    })()

    return () => {
      disposed = true
      handleRef.current?.dispose()
      handleRef.current = null
    }
  }, [])

  return (
    <div className="scene-page">
      <canvas ref={canvasRef} className="scene-canvas" />
      <CardHost cards={cardStates} />
    </div>
  )
}

export default Scene3D
```

**就这么简单！** 3D 渲染、相机控制、卡片交互、窗口自适应全部自动处理。

---

## 三、场景数据格式 (LiveDataConfig)

场景数据是一个 JSON 对象，描述了整个 3D 世界的构成。以下是完整结构：

### 3.1 顶层结构

```jsonc
{
  "version": "1.0",
  "angleUnit": "degree",          // "degree" 或 "radian"，控制旋转字段单位
  "scene": { /* 场景环境 */ },
  "camera": { /* 相机 */ },
  "lights": [ /* 灯光数组 */ ],
  "objects": [ /* 物体数组 */ ]
}
```

### 3.2 场景环境 (scene)

```jsonc
{
  "scene": {
    "background": "#1a1a2e",                    // 背景色（hex）
    "environment": {
      "preset": "room",                          // IBL 环境光预设
      "intensity": 0.5                           // 环境光强度
    },
    "fog": {                                     // 线性雾（可选）
      "type": "linear",
      "color": "#1a1a2e",
      "near": 10,
      "far": 100
    }
  }
}
```

### 3.3 相机 (camera)

**透视相机：**

```jsonc
{
  "camera": {
    "type": "perspective",
    "position": [30, 25, 30],
    "lookAt": [0, 0, 0],
    "perspective": {
      "fov": 50,
      "near": 0.1,
      "far": 500
    }
  }
}
```

**正交相机：**

```jsonc
{
  "camera": {
    "type": "orthographic",
    "position": [0, 80, 0],
    "lookAt": [0, 0, 0],
    "orthographic": {
      "left": -50,
      "right": 50,
      "top": 50,
      "bottom": -50,
      "near": 0.1,
      "far": 200,
      "zoom": 1
    }
  }
}
```

### 3.4 灯光 (lights)

```jsonc
[
  // 环境光
  { "type": "ambient", "color": "#ffffff", "intensity": 0.4 },

  // 半球光
  {
    "type": "hemisphere",
    "skyColor": "#87ceeb",
    "groundColor": "#362907",
    "intensity": 0.6,
    "position": [0, 50, 0]
  },

  // 平行光（可投射阴影）
  {
    "type": "directional",
    "color": "#ffffff",
    "intensity": 1.2,
    "position": [20, 30, 10],
    "target": [0, 0, 0],
    "castShadow": true,
    "shadow": {
      "mapSize": 2048,
      "camera": { "near": 0.5, "far": 100, "left": -50, "right": 50, "top": 50, "bottom": -50 }
    }
  }
]
```

### 3.5 物体 (objects)

物体通过 `parentId` 构成树形层级，`parentId: null` 表示挂到场景根节点。

#### 基础网格 (mesh)

```jsonc
{
  "id": "buildingA_body",
  "type": "mesh",
  "parentId": "sceneRoot",
  "position": [10, 5, 8],
  "rotation": [0, 45, 0],
  "scale": [1, 1, 1],
  "geometry": {
    "type": "box",
    "params": { "width": 6, "height": 10, "depth": 4 }
  },
  "material": {
    "type": "standard",
    "color": "#4a90d9",
    "roughness": 0.7,
    "metalness": 0.1
  },
  "castShadow": true,
  "receiveShadow": true
}
```

#### 分组 (group)

```jsonc
{
  "id": "tree01",
  "type": "group",
  "parentId": "sceneRoot",
  "position": [5, 0, 3],
  "children": []  // 子物体通过 parentId 引用此 id
}
```

#### 预制组件 (component)

```jsonc
{
  "id": "rack01",
  "type": "component",
  "parentId": "warehouseZone",
  "position": [2, 0, 5],
  "component": {
    "type": "rack",                    // 已注册的组件 builder 名称
    "params": { "rows": 4, "columns": 3, "levels": 5 }
  },
  "material": {
    "type": "standard",
    "color": "#888888",
    "metalness": 0.6
  }
}
```

### 3.6 支持的几何体类型

| type | params 参数 |
|------|------------|
| `box` | `width`, `height`, `depth` |
| `plane` | `width`, `height` |
| `sphere` | `radius`, `widthSegments`, `heightSegments` |
| `cylinder` | `radiusTop`, `radiusBottom`, `height`, `radialSegments`, `radialSegments` |
| `cone` | `radius`, `height`, `radialSegments` |
| `torus` | `innerRadius`, `outerRadius`, `radialSegments`, `thetaSegments`, `arc` |
| `circle` | `radius`, `segments` |
| `ring` | `innerRadius`, `outerRadius`, `thetaSegments`, `phiSegments` |
| `text` | `text` (文字内容), `size`, `depth` |

### 3.7 支持的材质类型

| type | 特有参数 |
|------|---------|
| `standard` | `color`, `roughness`, `metalness` |
| `phong` | `color` |
| `basic` | `color` |
| `physical` | `color`, `roughness`, `metalness`, `transmission`, `ior`, `thickness`, `clearcoat`, `clearcoatRoughness`, `sheen`, `sheenColor` |

所有材质通用：`transparent`, `opacity`, `map`（贴图路径）

### 3.8 已注册的预制组件

以下组件可通过 `type: "component"` 直接使用：

| 类别 | 组件 type | 说明 |
|------|----------|------|
| 仓储 | `rack` | 货架 |
| 仓储 | `bookshelf` | 书架 |
| 仓储 | `showcase` | 展示柜 |
| 仓储 | `pallet` | 托盘 |
| 仓储 | `bin` | 料箱 |
| 工业 | `cnc-machine` | 数控机床 |
| 工业 | `conveyor` | 传送带 |
| 工业 | `press` | 冲压机 |
| 工业 | `robot-arm` | 机械臂 |
| 港口 | `container` | 集装箱 |
| 港口 | `crane` | 起重机 |
| 港口 | `dock` | 码头 |
| 港口 | `forklift` | 叉车 |
| 通用 | `cabinet` | 机柜 |
| 通用 | `desk` | 桌子 |
| 通用 | `partition` | 隔断 |
| 通用 | `signage` | 标识牌 |

---

## 四、2D 卡片系统

卡片系统是 3D 场景与业务数据交互的核心。你只需要：

1. **写一个 React 组件**（卡片长什么样你说了算）
2. **写一条扫描规则**（告诉引擎哪些物体挂卡片、传什么数据）

### 4.1 编写卡片组件

卡片就是一个普通的 React 组件，接收引擎传入的 props：

```tsx
// MyCard.tsx
import React from 'react'

interface MyCardProps {
  cardId: string       // 卡片唯一 ID（引擎自动注入）
  objectId: string     // 关联的 3D 物体 ID（引擎自动注入）
  label?: string       // 你在 props 回调中传入的业务数据
  status?: string
  temperature?: number
}

const MyCard: React.FC<MyCardProps> = ({ label, status, temperature }) => {
  return (
    <div className="my-card" onClick={(e) => e.stopPropagation()}>
      <div className="card-title">{label}</div>
      <div className="card-info">
        <span>状态：{status}</span>
        <span>温度：{temperature}°C</span>
      </div>
    </div>
  )
}

export default MyCard
```

> ⚠️ **重要：** 卡片根元素必须加 `onClick={(e) => e.stopPropagation()}`，防止点击穿透到 3D 场景。

### 4.2 声明卡片扫描规则

扫描规则定义了「哪些 3D 物体挂什么卡片、卡片显示在哪、传什么数据」：

```ts
// cards/sceneCardRules.ts
import type { CardScanRule } from '@/3d'
import MyCard from '@/components/cards/MyCard'

export const cardRules: CardScanRule[] = [
  {
    // ── 卡片类型（对应 Vue 组件注册名）──
    type: 'device',

    // ── Vue 组件（传入即自动注册，无需手动 register）──
    component: MyCard,

    // ── 命名匹配规则（核心！）──
    // pattern 匹配 mesh.name（即 live-data 中的 object id）
    // 捕获组 [1] = 分组 ID，同组的 mesh 共享一张卡片
    pattern: /^(device\d+)_/,   // device01_body, device01_screen → 分组 id = device01

    // ── 锚点选取（卡片定位到哪个 mesh 上）──
    anchor: 'highest',   // 'highest' | 'first' | '_body' 后缀 | 自定义函数

    // ── 卡片偏移（相对锚点，默认 [0, 0.6, 0]）──
    offset: [0, 1.0, 0],

    // ── 交互分组（同组互斥：点击一个自动关闭其他）──
    interactiveGroup: 'scene',

    // ── 业务 props（从分组信息派生传给卡片组件的数据）──
    props: ({ id, anchor, meshes }) => ({
      label: `设备 ${id.replace('device', '').padStart(2, '0')}`,
      status: getDeviceStatus(id),        // 从你的业务数据源查询
      temperature: getDeviceTemp(id),
    }),
  },
]
```

### 4.3 CardScanRule 详解

```ts
interface CardScanRule {
  /** 卡片类型名，对应 cardComponentRegistry 中的 Vue 组件 */
  type: string

  /** Vue 组件；传入即自动注册，无需手动调 cardComponentRegistry.register */
  component?: Component

  /**
   * 匹配 mesh.name 的正则表达式
   * - mesh.name === live-data 中的 object.id
   * - 捕获组 [1] 表示「分组 ID」
   * - 同一捕获组 [1] 的 mesh 归为一组，共享一张卡片
   *
   * 示例：
   *   /^(tree\d+)_/       → tree01_trunk, tree01_canopy → 分组 id = tree01
   *   /^(building[A-Z])_/ → buildingA_body              → 分组 id = buildingA
   *   /^(rack\d+)/        → rack01                      → 分组 id = rack01
   */
  pattern: RegExp

  /**
   * 锚点选取方式（卡片定位到组内哪个 mesh 上）
   * - 'highest' : position.y 最大的 mesh（卡片飘在顶部）
   * - 'first'   : meshes[0]
   * - string    : name 以该后缀结尾的 mesh（如 '_body'），找不到回退 meshes[0]
   * - function  : 完全自定义 (meshes) => Object3D
   */
  anchor?: CardAnchorSpec

  /** 卡片相对锚点的偏移量，默认 [0, 0.6, 0] */
  offset?: [number, number, number]

  /**
   * 交互分组名。同组内的卡片互斥显示：
   * - 点击一个卡片，同组其他卡片自动隐藏
   * - 点击空白区域，同组所有卡片隐藏
   * 不填则默认 'scene'（全局互斥）
   */
  interactiveGroup?: string

  /**
   * 从分组信息派生传给卡片组件的业务 props
   * - id: 分组 ID（pattern 捕获组 [1]）
   * - meshes: 该分组的全部关联 mesh
   * - anchor: 选取出的锚点物体
   */
  props?: (group: CardScanGroup) => Record<string, unknown>
}
```

### 4.4 命名约定（关键！）

**3D 物体的 `id` 命名必须与卡片规则的 `pattern` 匹配。** 这是卡片系统工作的前提。

```
live-data.json 中的 id:    "tree01_trunk", "tree01_canopy", "tree02_trunk", "tree02_canopy"
cardRules 中的 pattern:    /^(tree\d+)_/
                           ↓ 捕获组 [1]
分组结果:                   tree01 → [tree01_trunk, tree01_canopy]
                           tree02 → [tree02_trunk, tree02_canopy]
```

**推荐命名规范：**

| 场景 | id 命名示例 | pattern |
|------|------------|---------|
| 设备 | `device01_body`, `device01_screen` | `/^(device\d+)_/` |
| 货架 | `rack01`, `rack02` | `/^(rack\d+)/` |
| 建筑 | `buildingA_body`, `buildingA_roof` |A_roof` | `/^(building[A-Z])_/` |
| AGV | `agv01`, `agv02` | `/^(agv\d+)$/` |

---

## 五、createScene3D API 参考

### 5.1 函数签名

```ts
function createScene3D(
  canvas: HTMLCanvasElement,   // 你的 <canvas ref>
  data: LiveDataConfig,        // 场景数据 JSON
  options?: Scene3DOptions,    // 可选配置
): Scene3DHandle
```

### 5.2 Scene3DOptions

```ts
interface Scene3DOptions {
  /** 卡片扫描规则（业务方提供） */
  cardRules?: CardScanRule[]

  /** CSS2D 卡片层挂载容器，默认 canvas.parentElement */
  container?: HTMLElement

  /** 是否显示 grid/axes 调试辅助，默认 false */
  debug?: boolean

  /** OrbitControls 配置 */
  controls?: {
    minDistance?: number       // 最近距离（透视相机）
    maxDistance?: number       // 最远距离（透视相机）
    maxPolarAngle?: number    // 最大仰角（弧度），如 Math.PI/2 防止翻到地面下
    target?: { x: number; y: number; z: number }  // 轨道中心点
  }

  /** 是否启用阴影，默认 true */
  enableShadows?: boolean
}
```

### 5.3 Scene3DHandle（返回值）

```ts
interface Scene3DHandle {
  /** 引擎实例（一般不需要直接用） */
  app: App3D

  /** 卡片管理器，可手动控制卡片显示/隐藏 */
  cardManager: CardManager

  /** OrbitControls 实例，用于编程式控制相机 */
  controls: OrbitControlsInstance

  /**
   * 订阅卡片状态变化
   * 回调参数 CardState[] 传给 <CardHost :cards>
   * 返回取消订阅函数
   */
  onCardState(cb: (states: CardState[]) => void): () => void

  /**
   * 增量更新场景物体（按 id 增删改）
   * 自动同步受影响的卡片
   */
  update(patch: SceneUpdatePatch): void

  /** 销毁：释放 GPU/DOM/事件资源 */
  dispose(): void
}
```

---

## 六、增量更新（动态场景）

场景创建后，你可以通过 `handle.update()` 动态增删改物体，适用于 AGV 移动、设备状态变化、动态增删实体等场景。

### 6.1 新增/修改物体 (upsert)

```ts
handle.update({
  objects: {
    upsert: [
      {
        id: 'agv01',                    // id 已存在 → 就地修改；不存在 → 创建
        type: 'mesh',
        parentId: 'sceneRoot',
        position: [15, 0, 8],           // 移动到新位置
        geometry: { type: 'box', params: { width: 2, height: 1, depth: 1 } },
        material: { type: 'standard', color: '#ff4444' },  // 换色
      },
    ],
  },
})
```

**upsert 行为：**
- id **已存在**：就地补丁（只更新 position/rotation/scale/material/geometry），保留 Object3D 身份，不重建不闪烁
- id **不存在**：创建新物体并挂到 parentId 指定的父节点

### 6.2 删除物体 (remove)

```ts
handle.update({
  objects: {
    remove: ['agv01', 'agv02'],   // 按 id 删除
  },
})
```

### 6.3 混合操作

```ts
handle.update({
  objects: {
    upsert: [
      { id: 'agv01', type: 'mesh', parentId: 'sceneRoot', position: [20, 0, 5], ... },
      { id: 'marker_new', type: 'mesh', parentId: 'sceneRoot', position: [0, 5, 0], ... },
    ],
    remove: ['old_marker'],
  },
})
```

> 💡 增量更新后，受影响的卡片会自动刷新（锚点、props 按当前场景重算），无需手动处理。

---

## 七、完整示例

以下是一个完整的集成示例，包含场景数据获取、卡片组件、扫描规则和动态更新：

### 7.1 页面组件

```vue
<template>
  <div class="scene-page">
    <canvas ref="canvasRef" class="scene-canvas" />
    <CardHost :cards="cardStates" />

    <!-- 加载状态 -->
    <div class="loading-overlay" v-if="loading">
      <div class="spinner"></div>
      <p>加载场景...</p>
    </div>

    <!-- 错误提示 -->
    <div class="error-overlay" v-if="error" @click="error = ''">
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  createScene3D,
  CardHost,
  type Scene3DHandle,
  type CardState,
} from '@/3d'
import { cardRules } from '@/cards/sceneCardRules'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const error = ref('')
const cardStates = ref<CardState[]>([])
let handle: Scene3DHandle | null = null

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) {
    error.value = 'Canvas 不存在'
    loading.value = false
    return
  }

  try {
    // 从你的后端接口获取场景数据
    const data = await fetch('/api/scene/live-data').then(r => r.json())

    handle = createScene3D(canvas, data, {
      cardRules,
      controls: {
        maxPolarAngle: Math.PI / 2.3,  // 防止相机翻到地面下
      },
    })

    handle.onCardState(states => {
      cardStates.value = states
    })

    loading.value = false
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    error.value = `场景加载失败: ${msg}`
    loading.value = false
  }
})

onUnmounted(() => {
  handle?.dispose()
  handle = null
})
</script>

<style scoped>
.scene-page { width: 100%; height: 100%; position: relative; overflow: hidden; }
.scene-canvas { display: block; width: 100%; height: 100%; }
.loading-overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(26, 26, 46, 0.9); color: #c0c0e0;
}
.spinner {
  width: 36px; height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: #e94560; border-radius: 50%;
  animation: spin 0.8s linear infinite; margin-bottom: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-overlay {
  position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);
  background: rgba(220, 50, 50, 0.9); color: #fff;
  padding: 10px 24px; border-radius: 8px; font-size: 14px; cursor: pointer;
}
</style>
```

### 7.2 卡片组件

```vue
<!-- components/cards/InfoCard.vue -->
<template>
  <div class="info-card" :class="`kind-${kind}`" @click.stop>
    <div class="info-head">
      <span class="info-icon">{{ kind === 'tree' ? '🌲' : '🏢' }}</span>
      <span class="info-title">{{ label }}</span>
    </div>
    <div class="info-row">
      <span class="info-key">坐标</span>
      <span class="info-val">{{ posX }}, {{ posZ }}</span>
    </div>
    <div class="info-row">
      <span class="info-key">高度</span>
      <span class="info-val">{{ height.toFixed(1) }} m</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  cardId: string
  objectId: string
  kind?: 'tree' | 'building'
  label?: string
  position?: [number, number]
  height?: number
}>()

const kind = computed(() => props.kind ?? 'tree')
const label = computed(() => props.label ?? props.objectId)
const posX = computed(() => props.position?.[0]?.toFixed(1) ?? '0.0')
const posZ = computed(() => props.position?.[1]?.toFixed(1) ?? '0.0')
const height = computed(() => props.height ?? 0)
</script>
```

### 7.3 卡片扫描规则

```ts
// cards/sceneCardRules.ts
import type { CardScanRule } from '@/3d'
import InfoCard from '@/components/cards/InfoCard.vue'

const groupHeight = (meshes: { position: { y: number } }[]): number =>
  meshes.reduce((mx, m) => Math.max(mx, m.position.y), 0)

export const cardRules: CardScanRule[] = [
  {
    type: 'tree',
    component: InfoCard,
    pattern: /^(tree\d+)_/,       // tree01_trunk, tree01_canopy → id=tree01
    anchor: 'highest',            // 卡片飘在树顶
    offset: [0, 0.6, 0],
    interactiveGroup: 'scene',    // 全局互斥
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
    pattern: /^(building[A-Z])_/, // buildingA_body → id=buildingA
    anchor: '_body',              // 锚点取 *_body mesh
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
```

---

## 八、进阶用法

### 8.1 编程式控制相机

```ts
// 飞到某个位置
handle.controls.target.set(10, 0, 5)
handle.controls.update()

// 限制缩放范围（透视相机）
const handle = createScene3D(canvas, data, {
  controls: { minDistance: 5, maxDistance: 100 }
})
```

### 8.2 手动控制卡片

```ts
// 显示/隐藏特定卡片
handle.cardManager.showCard('tree01')
handle.cardManager.hideCard('tree01')
handle.cardManager.toggleCard('tree01')

// 按类型批量控制
handle.cardManager.showByType('tree')
handle.cardManager.hideByType('building')

// 冻结/解冻卡片交互（如播放动画时）
handle.cardManager.freeze()
handle.cardManager.unfreeze()
```

### 8.3 调试模式

```ts
const handle = createScene3D(canvas, data, {
  debug: true,  // 显示网格和坐标轴辅助线
})
```

### 8.4 使用包提供的 loadLiveDataConfig 工具

```ts
import { loadLiveDataConfig } from '@/3d'

// 默认加载 /live-data.json
const data = await loadLiveDataConfig()

// 或通过 URL 参数指定：?data=your-scene.json
// 或通过 URL 参数指定远程地址：?data=https://your-api.com/scene
const data = await loadLiveDataConfig()
```

### 8.5 定时更新场景（如 AGV 位置）

```ts
// 每 2 秒更新 AGV 位置
setInterval(async () => {
  const agvs = await fetch('/api/agv/positions').then(r => r.json())
  handle?.update({
    objects: {
      upsert: agvs.map(agv => ({
        id: agv.id,
        type: 'mesh',
        parentId: 'sceneRoot',
        position: [agv.x, 0, agv.z],
        rotation: [0, agv.heading, 0],
        geometry: { type: 'box', params: { width: 1.5, height: 0.8, depth: 1 } },
        material: { type: 'standard', color: agv.status === 'busy' ? '#ff4444' : '#44ff44' },
      })),
    },
  })
}, 2000)
```

---

## 九、类型导入速查

所有类型统一从 `@/3d` 导入，无需关心内部文件路径：

```ts
import type {
  // 核心 API
  Scene3DOptions,
  Scene3DHandle,
  SceneUpdatePatch,
  OrbitControlsInstance,

  // 场景数据
  LiveDataConfig,
  LiveDataCamera,
  LiveDataLight,
  LiveDataObject,
  LiveDataGeometry,
  LiveDataMaterial,

  // 卡片系统
  CardScanRule,
  CardScanGroup,
  CardAnchorSpec,
  CardState,
  CardDef,
} from '@/3d'
```

---

## 十、常见问题

### Q: 卡片不显示？

检查以下几点：
1. `<CardHost :cards="cardStates" />` 是否放在模板中
2. `handle.onCardState()` 是否已调用
3. `cardRules` 中的 `pattern` 是否能匹配到 live-data 中的 object id
4. 卡片组件是否通过 `cardRules` 的 `component` 字段或手动 `cardComponentRegistry.register()` 注册

### Q: 正交相机下缩放不生效？

`minDistance` / `maxDistance` 只对透视相机有效。正交相机请通过 `controls` 实例设置 `minZoom` / `maxZoom`。

### Q: 点击卡片时场景也响应了？

确保卡片根元素加了 `@click.stop`。

### Q: 增量更新后卡片没刷新？

`handle.update()` 会自动刷新受影响分组的卡片。如果没刷新，检查 upsert/remove 的物体 id 是否与 cardRules 的 pattern 匹配。

### Q: 如何自定义卡片定位逻辑？

使用 `anchor` 的函数形式：

```ts
anchor: (meshes) => {
  // 自定义逻辑：比如取 name 包含 'top' 的 mesh
  return meshes.find(m => m.name.includes('top')) ?? meshes[0]
}
```

### Q: 多种卡片类型如何共存？

定义多条 `CardScanRule`，每条有不同的 `type` 和 `pattern`：

```ts
export const cardRules: CardScanRule[] = [
  { type: 'device', component: DeviceCard, pattern: /^(device\d+)_/, ... },
  { type: 'sensor', component: SensorCard, pattern: /^(sensor\d+)_/, ... },
  { type: 'agv',    component: AgvCard,    pattern: /^(agv\d+)$/, ... },
]
```

---

## 十一、集成检查清单

- [ ] 安装 `three` 依赖
- [ ] 页面模板包含 `<canvas ref>` 和 `<CardHost :cards />`
- [ ] 准备 `LiveDataConfig` JSON 数据（从接口获取或本地文件）
- [ ] 编写 2D 卡片 Vue 组件（加 `@click.stop`）
- [ ] 编写 `CardScanRule[]`（pattern 与 object id 命名对齐）
- [ ] 调用 `createScene3D(canvas, data, { cardRules })`
- [ ] 调用 `handle.onCardState()` 订阅卡片状态
- [ ] `onUnmounted` 中调用 `handle.dispose()`
- [ ] canvas 父容器有明确的宽高（100% × 100%）
