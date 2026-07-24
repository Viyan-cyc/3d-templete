# 3D 场景集成文档

> 本文档面向 **产品开发者**——需要将 3D 场景集成到自己产品中的开发人员。
> 你不需要了解 Three.js、WebGL 或任何 3D 图形知识。只需关心：传什么数据、怎么写卡片、怎么接收交互回调。
>
> 如果你是在本工程中添加 3D 组件的开发者，请阅读 [开发文档](./DEVELOPMENT_GUIDE.md)。

---

## 目录

1. [5 分钟快速开始](#1-5-分钟快速开始)
2. [核心概念](#2-核心概念)
3. [数据结构详解（LiveDataConfig）](#3-数据结构详解liveconfig)
4. [物体类型与写法](#4-物体类型与写法)
5. [材质写法速查](#5-材质写法速查)
6. [卡片系统：3D 物体上的 2D 信息面板](#6-卡片系统3d-物体上的-2d-信息面板)
7. [运行时数据更新](#7-运行时数据更新)
8. [编辑态交互（iframe 嵌入）](#8-编辑态交互iframe-嵌入)
9. [常见场景示例](#9-常见场景示例)
10. [API 速查](#10-api-速查)
11. [常见问题](#11-常见问题)

---

## 1. 5 分钟快速开始

### 1.1 最简集成代码

```vue
<template>
  <div ref="container" style="position: relative; width: 100%; height: 100vh;">
    <canvas ref="canvas" style="width: 100%; height: 100%; display: block;" />
    <CardHost :cards="cardStates" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { createScene3D, CardHost, type CardState } from '@/3d'
import { cardRules } from './sceneCardRules'   // 你定义的卡片规则

const canvas = ref<HTMLCanvasElement>()
const container = ref<HTMLDivElement>()
const cardStates = ref<CardState[]>([])

let handle: Awaited<ReturnType<typeof createScene3D>> | null = null

onMounted(async () => {
  // ① 获取场景数据（从 API、静态文件、或任意来源）
  const data = await fetch('/api/scene').then(r => r.json())

  // ② 创建 3D 场景
  handle = await createScene3D(canvas.value!, data, {
    cardRules,             // 卡片规则（决定哪些物体挂什么卡片）
    container: container.value!,  // 卡片 UI 层的挂载容器
  })

  // ③ 订阅卡片状态，喂给 <CardHost>
  handle.onCardState((states) => {
    cardStates.value = states
  })
})

onUnmounted(() => {
  handle?.dispose()   // 释放所有资源
})
</script>
```

**就这些。** 你不需要写任何 3D 代码。

### 1.2 你需要准备的东西

| 东西 | 说明 |
|------|------|
| **场景数据** | 一份 JSON，描述场景里有什么物体、长什么样、怎么布局 |
| **卡片规则** | 一段 TypeScript 代码，描述哪些物体上显示什么 2D 卡片 |
| **卡片 Vue 组件** | 普通的 Vue 组件，写卡片长什么样、显示什么数据 |

---

## 2. 核心概念

### 2.1 数据驱动

3D 场景完全由 **数据驱动**。你不需要操作 3D 对象，只需要构造一份 JSON 数据，引擎会自动把 JSON 翻译成 3D 场景。

```
你的 JSON 数据  →  3D 引擎自动渲染  →  用户看到 3D 场景
```

数据变了，场景自动跟着变。

### 2.2 三个核心对象

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  LiveData   │     │  CardRules  │     │  CardHost   │
│  (JSON数据)  │ →   │  (卡片规则)  │ →   │  (卡片UI)   │
│             │     │             │     │             │
│ 场景里有什么  │     │ 哪些物体挂卡片 │     │ 卡片长什么样  │
│ 物体长什么样  │     │ 卡片类型是什么 │     │ 显示什么数据  │
│ 物体在哪里   │     │ 卡片出现在哪  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **LiveData（JSON 数据）**：描述场景的全部内容——背景、相机、灯光、物体
- **CardRules（卡片规则）**：描述哪些 3D 物体上需要显示 2D 信息卡片
- **CardHost（卡片宿主）**：一个 Vue 组件，负责把你的卡片组件渲染到 3D 物体旁边

### 2.3 你只关心的两件事

1. **传数据**：构造 LiveDataConfig JSON → 调 `createScene3D` → 场景出现
2. **写卡片**：写 Vue 组件 + 定义 CardScanRule → 卡片出现在 3D 物体旁边

---

## 3. 数据结构详解（LiveDataConfig）

### 3.1 顶层结构

```jsonc
{
  "version": "1.0",           // 版本号，固定 "1.0"
  "angleUnit": "deg",         // 角度单位，"deg"=度，"rad"=弧度
  "scene": {                  // 场景环境
    "background": "#87CEEB",  // 背景色
    "environment": {          // 环境光（影响材质反射）
      "preset": "city",
      "intensity": 0.9
    },
    "fog": {                  // 雾效（远处物体淡出）
      "type": "linear",
      "color": "#aecbe6",
      "near": 80,             // 开始淡出距离
      "far": 220              // 完全消失距离
    }
  },
  "camera": { ... },          // 相机配置（见下方）
  "lights": [ ... ],          // 灯光列表（见下方）
  "objects": [ ... ]          // 物体列表（见下方）
}
```

### 3.2 相机

```jsonc
// 透视相机（近大远小，最常用）
{
  "camera": {
    "type": "perspective",
    "position": [45, 38, 55],   // 相机位置 [x, y, z]
    "lookAt": [0, 4, 0],        // 看向的点 [x, y, z]
    "perspective": {
      "fov": 50,                // 视场角（越大看得越广）
      "near": 0.1,              // 近裁面
      "far": 1000               // 远裁面
    }
  }
}

// 正交相机（无近大远小，适合 2.5D / 俯视图）
{
  "camera": {
    "type": "orthographic",
    "position": [0, 100, 0],
    "lookAt": [0, 0, 0],
    "orthographic": {
      "left": -50, "right": 50,
      "top": 50, "bottom": -50,
      "near": 0.1, "far": 500,
      "zoom": 1
    }
  }
}
```

**常用参数**：
- `position`：相机在 3D 空间中的位置。`[x, y, z]`，y 是高度
- `lookAt`：相机看向哪个点
- `fov`：视野角度，50-60 是舒适范围，越大看到越多但变形越大

### 3.3 灯光

```jsonc
"lights": [
  // 环境光：均匀照亮一切，没有方向
  {
    "type": "ambient",
    "intensity": 0.65,
    "color": "#ffffff"
  },
  // 半球光：天空色 + 地面色，模拟自然光
  {
    "type": "hemisphere",
    "intensity": 0.5,
    "skyColor": "#87CEEB",
    "groundColor": "#a0a0a0",
    "position": [0, 50, 0]
  },
  // 方向光：太阳光，可投阴影
  {
    "type": "directional",
    "intensity": 1.5,
    "color": "#fff4e0",
    "position": [40, 60, 30],    // 光源位置
    "target": [0, 0, 0],         // 光照目标
    "castShadow": true,
    "shadow": {
      "mapSize": 4096,           // 阴影贴图分辨率
      "camera": {
        "near": 0.5, "far": 200,
        "left": -60, "right": 60,
        "top": 60, "bottom": -60
      }
    }
  }
]
```

**灯光速查**：
- 一般场景：1 个 ambient + 1 个 hemisphere + 1 个 directional 就够了
- `castShadow: true` 让物体投下阴影（需要物体也设置 `castShadow`/`receiveShadow`）

### 3.4 物体（objects）

物体是场景的核心。通过 `parentId` 建立父子层级关系。

```jsonc
"objects": [
  {
    "id": "ground",              // 唯一标识符（你自定义）
    "type": "mesh",              // 物体类型
    "parentId": null,            // 父节点 id，null 表示挂在场景根
    "position": [0, 0, 0],      // 位置 [x, y, z]
    "rotation": [-90, 0, 0],    // 旋转 [x, y, z]（度）
    "scale": [1, 1, 1],         // 缩放 [x, y, z]
    "geometry": { ... },         // 形状
    "material": { ... },         // 材质
    "castShadow": true,          // 投射阴影
    "receiveShadow": true        // 接收阴影
  }
]
```

---

## 4. 物体类型与写法

### 4.1 group — 分组/容器

不显示任何东西，只用来组织层级。子物体会跟随父 group 移动。

```jsonc
{
  "id": "treeGroup",
  "type": "group",
  "parentId": "gardenZone",
  "position": [5, 0, 10]
}
```

### 4.2 mesh — 基础几何体

最常用的物体类型。通过 `geometry` 指定形状，`material` 指定外观。

```jsonc
{
  "id": "floor",
  "type": "mesh",
  "parentId": null,
  "geometry": {
    "type": "box",
    "params": { "width": 40, "height": 0.2, "depth": 40 }
  },
  "material": {
    "type": "standard",
    "color": "#333338",
    "roughness": 0.95
  },
  "position": [0, 0, 0],
  "receiveShadow": true
}
```

**支持的几何体**：

| 类型 | 参数 | 用途 |
|------|------|------|
| `box` | `width`, `height`, `depth` | 方块/建筑/地面 |
| `plane` | `width`, `height` | 地面/墙面/贴图面 |
| `sphere` | `radius`, `widthSegments`, `heightSegments` | 球体/树冠 |
| `cylinder` | `radiusTop`, `radiusBottom`, `height`, `radialSegments` | 柱子/树干 |
| `cone` | `radius`, `height`, `radialSegments` | 锥体/尖顶 |
| `torus` | `innerRadius`, `outerRadius`, `radialSegments`, `thetaSegments` | 圆环 |
| `circle` | `radius`, `segments` | 圆面/底盘 |
| `ring` | `innerRadius`, `outerRadius`, `thetaSegments` | 环面/装饰 |
| `text` | `text`, `size`, `depth` | 文字（ASCII 立体，中文贴图） |

**几何体参数都有默认值**，可以省略不写。比如 `box` 默认是 1×1×1 的立方体。

### 4.3 component — 内置组件

预置的复合组件（如货架、书架、传送带等），通过 `component.type` 指定。

```jsonc
{
  "id": "rack01",
  "type": "component",
  "parentId": "warehouseZone",
  "component": {
    "type": "rack",
    "params": { "rows": 4, "cols": 3, "layers": 5 }
  },
  "material": {
    "type": "standard",
    "color": "#888888",
    "roughness": 0.5,
    "metalness": 0.3
  },
  "position": [10, 0, 5]
}
```

**内置组件列表**：

| 类域 | 组件 type | 说明 |
|------|-----------|------|
| 通用 | `cabinet` | 文件柜 |
| 通用 | `desk` | 办公桌 |
| 通用 | `partition` | 隔断 |
| 通用 | `signage` | 标识牌 |
| 仓储 | `rack` | 货架 |
| 仓储 | `bin` | 料箱 |
| 仓储 | `pallet` | 托盘 |
| 仓储 | `bookshelf` | 书架 |
| 仓储 | `showcase` | 展柜 |
| 工业 | `cnc-machine` | 数控机床 |
| 工业 | `conveyor` | 传送带 |
| 工业 | `press` | 冲压机 |
| 工业 | `robot-arm` | 机械臂 |
| 港口 | `container` | 集装箱 |
| 港口 | `crane` | 起重机 |
| 港口 | `dock` | 码头 |
| 港口 | `forklift` | 叉车 |

### 4.4 component (3d-components) — 高级组件

引用 `@cyc/3d-components` 组件库中的组件，通过 `component.name` 指定。支持 Grid、Wall、HeatMesh 等。

```jsonc
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

> **`name` vs `type`**：`name` 引用 3d-components 库组件（优先级最高），`type` 引用内置 builder 组件。如果同时存在，`name` 优先。

### 4.5 glb/model — 外部模型

加载 GLB/GLTF 3D 模型文件。

```jsonc
// 引用本地注册的模型
{
  "id": "windmill01",
  "type": "glb",
  "parentId": "farmZone",
  "src": "asset:windmill",
  "position": [10, 0, 5],
  "castShadow": true
}

// 引用远程 URL 模型
{
  "id": "customModel01",
  "type": "model",
  "parentId": null,
  "src": "https://example.com/models/car.glb",
  "position": [0, 0, 0]
}
```

**模型 src 格式**：

| 前缀 | 示例 | 说明 |
|------|------|------|
| `asset:xxx` | `asset:windmill` | 本地注册模型（需 3D 开发者在 modelRegistry 中注册） |
| `https://...` | `https://cdn.example.com/car.glb` | 远程 URL |
| `hunyuan:xxx` | `hunyuan:风力发电机` | AI 生成模型（暂不可用） |

> 模型加载是异步的：场景会先显示，模型加载完后自动出现。加载失败会显示一个红色方块占位。

---

## 5. 材质写法速查

### 5.1 常用材质模板

```jsonc
// 🏢 建筑外墙 — 米白色微光泽
{ "type": "standard", "color": "#f0f0f0", "roughness": 0.6, "metalness": 0.12 }

// 🏗️ 混凝土地面 — 粗糙深灰
{ "type": "standard", "color": "#333338", "roughness": 0.95, "metalness": 0 }

// 🌳 树冠 — 哑光绿
{ "type": "standard", "color": "#4a8a4a", "roughness": 0.8, "metalness": 0 }

// 🔧 金属设备 — 有金属感
{ "type": "standard", "color": "#888888", "roughness": 0.4, "metalness": 0.7 }

// 💡 灯泡/发光体 — 不受光照影响
{ "type": "basic", "color": "#fff8dc" }

// 🌊 半透明区域 — 透明蓝
{ "type": "standard", "color": "#2a5ad9", "transparent": true, "opacity": 0.2, "roughness": 0.8 }

// 🪟 玻璃 — 高透射
{ "type": "physical", "color": "#ffffff", "roughness": 0.05, "metalness": 0, "transmission": 0.9, "ior": 1.5, "thickness": 0.5 }

// 🔴 热力图低值 — 深蓝
{ "type": "basic", "color": "#0D47A1" }

// 🟡 热力图中值 — 黄色
{ "type": "basic", "color": "#FFD600" }

// 🔴 热力图高值 — 红色
{ "type": "basic", "color": "#D50000" }
```

### 5.2 材质参数说明

| 参数 | 类型 | 说明 | 常用值 |
|------|------|------|--------|
| `type` | string | 材质类型 | `standard`（默认）、`basic`（自发光）、`physical`（高级PBR） |
| `color` | string | 颜色（hex） | `"#ff4444"` |
| `roughness` | number | 粗糙度 0~1 | 0=镜面，1=完全粗糙，默认 0.5 |
| `metalness` | number | 金属度 0~1 | 0=非金属，1=纯金属，默认 0 |
| `transparent` | boolean | 是否透明 | `true` |
| `opacity` | number | 透明度 0~1 | 需 `transparent: true`，1=不透明 |
| `transmission` | number | 透射率 0~1 | 仅 physical，玻璃效果 |
| `ior` | number | 折射率 | 仅 physical，玻璃 1.5 |
| `clearcoat` | number | 清漆层 0~1 | 仅 physical，车漆效果 |

---

## 6. 卡片系统：3D 物体上的 2D 信息面板

### 6.1 卡片是什么

卡片是浮在 3D 物体旁边的 **2D 信息面板**，用普通的 Vue 组件来写。它通过 CSS2D 技术定位在 3D 物体旁边，跟随物体移动。

```
     ┌──────────────┐
     │ 🌡️ 温度: 42°C │  ← 这是卡片（你写的 Vue 组件）
     │ 📊 状态: 运行中  │
     └──────┬───────┘
            │
            ▼
        ┌───────┐
        │       │  ← 这是 3D 物体（JSON 数据驱动）
        │ 设备  │
        │       │
        └───────┘
```

### 6.2 第一步：写卡片 Vue 组件

卡片就是一个普通的 Vue 组件，接收 `cardId`、`objectId` 和自定义 props。

```vue
<!-- DeviceCard.vue -->
<template>
  <div class="device-card">
    <div class="card-title">{{ name }}</div>
    <div class="card-row">
      <span class="label">状态</span>
      <span :class="['status', status]">{{ statusText }}</span>
    </div>
    <div class="card-row">
      <span class="label">温度</span>
      <span>{{ temperature }}°C</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  cardId: string       // 卡片 id（自动注入）
  objectId: string     // 关联的 3D 物体 id（自动注入）
  name?: string        // 以下为自定义 props
  status?: string
  temperature?: number
}>()

const statusText = computed(() => {
  const map: Record<string, string> = {
    running: '运行中',
    stopped: '已停止',
    warning: '警告',
    offline: '离线',
  }
  return map[props.status ?? ''] ?? props.status
})
</script>

<style scoped>
.device-card {
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  min-width: 140px;
  pointer-events: auto;
}
.card-title {
  font-weight: bold;
  margin-bottom: 6px;
  font-size: 14px;
}
.card-row {
  display: flex;
  justify-content: space-between;
  margin: 3px 0;
}
.label { color: #999; }
.status.running { color: #4CAF50; }
.status.stopped { color: #F44336; }
.status.warning { color: #FF9800; }
.status.offline { color: #666; }
</style>
```

### 6.3 第二步：定义卡片规则

卡片规则告诉引擎：**哪些物体挂卡片、卡片用什么组件、卡片显示什么数据**。

```ts
// sceneCardRules.ts
import type { CardScanRule } from '@/3d'
import DeviceCard from './DeviceCard.vue'
import BuildingCard from './BuildingCard.vue'

export const cardRules: CardScanRule[] = [
  {
    // ── 匹配规则 ──
    type: 'device',                    // 卡片类型名（自定义，用于注册组件）
    component: DeviceCard,             // Vue 组件（传入即自动注册，不用手动 register）
    pattern: /^(device\d+)_/,          // 正则匹配物体 id，捕获组 [1] 是分组 id

    // ── 位置控制 ──
    anchor: 'highest',                 // 锚点选 y 最高的子物体（卡片飘在顶部）
    offset: [0, 1.2, 0],              // 卡片相对锚点的偏移 [x, y, z]

    // ── 交互控制 ──
    interactiveGroup: 'scene',         // 同组互斥：同时只显示一张卡片

    // ── 数据注入 ──
    props: (group) => ({              // 从分组信息派生卡片 props
      name: `设备 ${group.id}`,
      status: 'running',
      temperature: 42,
    }),
  },
  {
    type: 'building',
    component: BuildingCard,
    pattern: /^(building\d+)_/,
    anchor: 'highest',
    offset: [0, 2, 0],
    interactiveGroup: 'scene',
    props: (group) => ({
      name: `建筑 ${group.id}`,
      floors: 10,
    }),
  },
]
```

### 6.4 pattern 匹配规则详解

`pattern` 是一个正则表达式，用来匹配 JSON 中物体的 `id`。

**关键约定**：物体的子部件用 `_` 连接父 id 和部件名。例如：

```
id = "tree01"          → 一棵树
id = "tree01_trunk"    → 这棵树的树干
id = "tree01_crown"    → 这棵树的树冠
```

`pattern: /^(tree\d+)_/` 的含义：
- `^` 从头匹配
- `(tree\d+)` 捕获组 [1]，匹配 `tree01`、`tree02` 等
- `_` 后面是部件名

同组的所有部件（`tree01_trunk` + `tree01_crown`）会被合并成一张卡片，点击任意一个部件都能触发这张卡片。

### 6.5 anchor 锚点详解

锚点决定卡片定位在物体的哪个位置。

| 值 | 说明 | 适用场景 |
|----|------|---------|
| `'highest'` | 取 y 坐标最高的子物体 | 树、建筑（卡片飘在顶部） |
| `'first'` | 取第一个子物体 | 默认值，大多数场景 |
| `'_body'` | 取 name 以 `_body` 结尾的子物体 | 有明确部件名的物体 |
| 自定义函数 | `(meshes) => meshes[0]` | 完全自定义 |

### 6.6 卡片显隐模式

卡片的显示/隐藏由 `CardDef.mode` 控制：

- **`click`**（默认）：点击物体显示卡片，再次点击或点击空白处隐藏。同 `interactiveGroup` 内互斥。
- **`always`**：始终显示，不受点击影响。

> 目前 `mode` 在 `CardScanRule` 产生的 `CardDef` 中默认是 `click`。如果需要 `always` 模式，可以通过 `cardManager.addCard` 手动添加。

### 6.7 props 数据流

卡片组件的 props 来源有两个：

1. **自动注入**：`cardId`（卡片 id）、`objectId`（关联 3D 物体 id）
2. **自定义**：`CardScanRule.props` 函数返回的对象

```ts
// props 函数接收 CardScanGroup，包含：
interface CardScanGroup {
  id: string                   // 分组 id（pattern 捕获组 [1]）
  meshes: THREE.Object3D[]     // 该分组的全部 3D 子物体
  anchor: THREE.Object3D       // 选出的锚点物体
}

// 示例：从 3D 物体属性中提取数据
props: (group) => {
  // 可以从 mesh 的 position 推算高度
  const height = Math.max(...group.meshes.map(m => m.position.y))
  return {
    name: group.id,
    height: Math.round(height * 10) / 10,
  }
}
```

> **实际项目中**，卡片数据通常来自后端 API，不是从 3D 物体推算。你可以在 `props` 函数中查找业务数据并注入。

---

## 7. 运行时数据更新

场景创建后，可以通过 `handle.update()` 按物体 id 做 **增/删/改**，不需要重建整个场景。

### 7.1 更新物体

```ts
// 移动一个物体
handle.update({
  objects: {
    upsert: [
      {
        id: 'agv01',             // 已有的 id → 就地更新
        position: [15, 0, 8],   // 新位置
      },
    ],
  },
})

// 修改物体外观
handle.update({
  objects: {
    upsert: [
      {
        id: 'device01',
        material: {              // 换材质
          type: 'standard',
          color: '#ff4444',      // 变红
          roughness: 0.5,
        },
      },
    ],
  },
})

// 新增一个物体
handle.update({
  objects: {
    upsert: [
      {
        id: 'newBox',            // 不存在的 id → 创建新物体
        type: 'mesh',
        parentId: 'sceneRoot',
        geometry: { type: 'box', params: { width: 2, height: 2, depth: 2 } },
        material: { type: 'standard', color: '#00ff88' },
        position: [5, 1, 5],
      },
    ],
  },
})
```

### 7.2 删除物体

```ts
handle.update({
  objects: {
    remove: ['tempObj01', 'tempObj02'],   // 按 id 删除
  },
})
```

### 7.3 混合操作

```ts
handle.update({
  objects: {
    upsert: [
      { id: 'agv01', position: [20, 0, 10] },    // 移动
      { id: 'newDevice', type: 'mesh', ... },      // 新增
    ],
    remove: ['oldDevice01'],                        // 删除
  },
})
```

### 7.4 更新特性

| 特性 | 说明 |
|------|------|
| **就地补丁** | 已有物体只更新变化的部分，不会重建，不闪烁 |
| **卡片同步** | 增删物体后，受影响的卡片自动更新 |
| **handler 分派** | 如果物体类型注册了 handler（如 device），更新走 handler 逻辑（如状态变色） |
| **乱序支持** | upsert 数组中子可以先于父出现，引擎会正确处理挂载顺序 |

---

## 8. 编辑态交互（iframe 嵌入）

### 8.1 概述

如果你的产品（如 octoapp）需要嵌入 3D 场景并在编辑模式下使用拾取、飞入、主题切换等功能，可以通过 iframe 嵌入 + postMessage 通信。

### 8.2 嵌入方式

```html
<!-- 宿主页面 -->
<iframe
  src="http://your-3d-app.com/embed"
  id="scene-iframe"
/>
```

### 8.3 postMessage 协议

**宿主 → 场景**（你发送给 iframe）：

| 消息类型 | 用途 | payload |
|----------|------|---------|
| `SCENE_UPDATE` | 替换整个场景数据 | 完整的 LiveDataConfig JSON |
| `SCENE_PATCH` | 增量更新物体 | SceneUpdatePatch（upsert/remove） |
| `SCENE_PICK_MODE` | 开启/关闭拾取模式 | `{ enabled: boolean }` |
| `SCENE_PICK_GRANULARITY` | 切换拾取粒度 | `{ granularity: 'part' \| 'whole' }` |
| `SCENE_FLY_TO` | 飞到指定物体 | `{ targetId: string }` |
| `SCENE_THEME` | 切换明暗主题 | `{ mode: 'light' \| 'dark' }` |
| `SCENE_RESET_CAMERA` | 复位相机 | 无 |

**场景 → 宿主**（iframe 发送给你）：

| 消息类型 | 用途 | 数据 |
|----------|------|------|
| `SCENE_READY` | 场景加载完成 | 无 |
| `SCENE_PICK` | 用户选中了一个物体 | `{ id, name?, component? }` |
| `SCENE_ERROR` | 场景出错 | `{ message: string }` |

### 8.4 代码示例

```ts
// 宿主页面：向 iframe 发消息
const iframe = document.getElementById('scene-iframe') as HTMLIFrameElement

// 加载场景
iframe.contentWindow!.postMessage({
  type: 'SCENE_UPDATE',
  payload: sceneData,  // LiveDataConfig JSON
}, '*')

// 开启拾取
iframe.contentWindow!.postMessage({
  type: 'SCENE_PICK_MODE',
  enabled: true,
}, '*')

// 飞到某物体
iframe.contentWindow!.postMessage({
  type: 'SCENE_FLY_TO',
  targetId: 'building01',
}, '*')

// 接收场景回传的拾取结果
window.addEventListener('message', (event) => {
  const msg = event.data
  if (msg.type === 'SCENE_PICK') {
    console.log('选中物体:', msg.id)
  }
  if (msg.type === 'SCENE_READY') {
    console.log('场景已就绪')
  }
})
```

---

## 9. 常见场景示例

### 9.1 搭建一个带热力图的城市俯瞰

```jsonc
{
  "version": "1.0",
  "angleUnit": "deg",
  "scene": {
    "background": "#1a1a2e",
    "environment": { "preset": "city", "intensity": 0.6 },
    "fog": { "type": "linear", "color": "#1a1a2e", "near": 80, "far": 250 }
  },
  "camera": {
    "type": "perspective",
    "position": [60, 50, 60],
    "lookAt": [0, 0, 0],
    "perspective": { "fov": 50, "near": 0.1, "far": 1000 }
  },
  "lights": [
    { "type": "ambient", "intensity": 0.5, "color": "#ffffff" },
    {
      "type": "directional",
      "intensity": 1.2,
      "color": "#fff4e0",
      "position": [40, 60, 30],
      "castShadow": true,
      "shadow": { "mapSize": 4096, "camera": { "near": 0.5, "far": 200, "left": -60, "right": 60, "top": 60, "bottom": -60 } }
    }
  ],
  "objects": [
    // 地面
    { "id": "ground", "type": "mesh", "parentId": null,
      "geometry": { "type": "plane", "params": { "width": 100, "height": 100 } },
      "material": { "type": "standard", "color": "#1a1a2e", "roughness": 0.95 },
      "position": [0, 0, 0], "rotation": [-90, 0, 0], "receiveShadow": true },

    // 建筑1
    { "id": "building01", "type": "mesh", "parentId": null,
      "geometry": { "type": "box", "params": { "width": 8, "height": 20, "depth": 8 } },
      "material": { "type": "standard", "color": "#e0e0e0", "roughness": 0.5, "metalness": 0.2 },
      "position": [15, 10, 15], "castShadow": true },

    // 建筑2
    { "id": "building02", "type": "mesh", "parentId": null,
      "geometry": { "type": "box", "params": { "width": 6, "height": 12, "depth": 6 } },
      "material": { "type": "standard", "color": "#f0f0f0", "roughness": 0.4, "metalness": 0.15 },
      "position": [-12, 6, 10], "castShadow": true },

    // 热力图区块（低值蓝）
    { "id": "heat01", "type": "mesh", "parentId": null,
      "geometry": { "type": "plane", "params": { "width": 8, "height": 8 } },
      "material": { "type": "standard", "color": "#1565C0", "transparent": true, "opacity": 0.3, "roughness": 0.8 },
      "position": [5, 0.05, 5], "rotation": [-90, 0, 0] },

    // 热力图区块（高值红）
    { "id": "heat02", "type": "mesh", "parentId": null,
      "geometry": { "type": "plane", "params": { "width": 8, "height": 8 } },
      "material": { "type": "standard", "color": "#D50000", "transparent": true, "opacity": 0.4, "roughness": 0.8 },
      "position": [-5, 0.05, -5], "rotation": [-90, 0, 0] }
  ]
}
```

### 9.2 仓储场景 + 货架卡片

```jsonc
// JSON 中的物体
{
  "id": "rack01_base",
  "type": "component",
  "parentId": "warehouseZone",
  "component": { "type": "rack", "params": { "rows": 3, "cols": 4, "layers": 5 } },
  "material": { "type": "standard", "color": "#888888", "roughness": 0.5, "metalness": 0.3 },
  "position": [5, 0, 3]
}
```

```ts
// 卡片规则
const cardRules: CardScanRule[] = [
  {
    type: 'rack',
    component: RackCard,
    pattern: /^(rack\d+)_/,          // 匹配 rack01_base, rack02_base 等
    anchor: 'highest',
    offset: [0, 1, 0],
    interactiveGroup: 'scene',
    props: (group) => ({
      rackId: group.id,
      utilization: 0.78,             // 从业务 API 查到的利用率
      itemCount: 156,
    }),
  },
]
```

### 9.3 实时更新 AGV 位置

```ts
// 每秒从后端拉取 AGV 位置并更新
setInterval(async () => {
  const agvs = await fetch('/api/agvs').then(r => r.json())

  handle.update({
    objects: {
      upsert: agvs.map(agv => ({
        id: agv.id,                           // AGV 的物体 id
        position: [agv.x, 0, agv.z],          // 新位置
        component: {
          type: 'agv',
          params: { status: agv.status },      // 状态（handler 会自动变色）
        },
      })),
    },
  })
}, 1000)
```

---

## 10. API 速查

### 10.1 createScene3D

```ts
function createScene3D(
  canvas: HTMLCanvasElement,      // 你的 <canvas> 元素
  data: LiveDataConfig,           // 场景数据 JSON
  options?: Scene3DOptions,       // 可选配置
): Promise<Scene3DHandle>
```

**Scene3DOptions**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `cardRules` | `CardScanRule[]` | `[]` | 卡片规则 |
| `container` | `HTMLElement` | `canvas.parentElement` | 卡片 UI 层容器 |
| `debug` | `boolean` | `false` | 调试面板（也可用 `?debug=true`） |
| `controls` | `object` | — | 轨道控制配置 |
| `enableShadows` | `boolean` | `true` | 是否开启阴影 |
| `interactive` | `boolean` | `false` | 编辑态（拾取/飞入/主题） |

### 10.2 Scene3DHandle

| 方法/属性 | 类型 | 说明 |
|-----------|------|------|
| `onCardState(cb)` | `(cb) => unsubFn` | 订阅卡片状态变化，返回取消订阅函数 |
| `update(patch)` | `(SceneUpdatePatch) => void` | 增量更新物体 |
| `setDebug(mode)` | `(boolean) => void` | 切换调试面板 |
| `picker` | `ScenePicker?` | 拾取器（仅 interactive） |
| `flyTo` | `(id: string) => void?` | 飞到物体（仅 interactive） |
| `setTheme` | `('light' \| 'dark') => void?` | 切换主题（仅 interactive） |
| `resetCamera` | `() => void?` | 复位相机（仅 interactive） |
| `dispose()` | `() => void` | 销毁场景，释放资源 |

### 10.3 CardHost

```vue
<CardHost :cards="cardStates" />
```

| Prop | 类型 | 说明 |
|------|------|------|
| `cards` | `CardState[]` | 由 `handle.onCardState` 提供的卡片状态数组 |
| `registry` | `CardRegistry?` | 卡片组件注册表（默认用全局注册表） |

### 10.4 SceneUpdatePatch

```ts
interface SceneUpdatePatch {
  objects?: {
    upsert?: LiveDataObject[]   // 按 id 增/改物体
    remove?: string[]           // 按 id 删除物体
  }
}
```

---

## 11. 常见问题

### Q: 我不会写 3D，能用这个吗？

**完全可以。** 你只需要写 JSON 数据和 Vue 卡片组件，不需要了解任何 Three.js 知识。3D 渲染完全由引擎处理。

### Q: JSON 中的坐标是什么意思？

3D 空间用 `[x, y, z]` 表示位置：
- `x`：左右（正数=右）
- `y`：上下（正数=上）
- `z`：前后（正数=前/远）

单位是"场景单位"，可以理解为米。

### Q: 旋转的度数怎么算？

`rotation` 也是 `[x, y, z]`：
- 绕 x 轴旋转：`[-90, 0, 0]` 把一个水平面翻转成竖直面
- 绕 y 轴旋转：`[0, 45, 0]` 让物体转向 45°
- 默认 `angleUnit: "deg"`，写度数即可

### Q: 怎么让一个平面平放在地上？

```jsonc
{
  "geometry": { "type": "plane", "params": { "width": 10, "height": 10 } },
  "rotation": [-90, 0, 0],    // ← 关键：绕 x 轴转 -90°
  "position": [0, 0, 0]       // y=0 贴地
}
```

### Q: 怎么让卡片始终显示？

默认卡片是点击才显示的。如果需要始终显示，可以在 `cardManager` 上手动操作：

```ts
handle.onCardState((states) => {
  cardStates.value = states
  // 让所有卡片都显示
  handle.cardManager.showByType('device')
})
```

### Q: 数据从哪里来？

数据来源完全由你决定：
- 静态文件：`fetch('/live-data.json')`
- 后端 API：`fetch('/api/scene')`
- 运行时构造：在 JavaScript 中构造 `LiveDataConfig` 对象

### Q: 怎么调试场景？

在 URL 中加 `?debug=true`，右上角会显示 FPS、三角形数、Draw Calls 等调试信息。

### Q: update 之后卡片没更新？

卡片更新依赖物体 `id` 的命名规则。确保：
1. `CardScanRule.pattern` 能匹配物体的 `id`
2. 新增物体的 id 遵循已有的命名规则（如 `device01_xxx`）
3. 增量更新后 `refreshCards` 会自动重扫受影响的卡片

### Q: 如何让物体有动画效果？

引擎本身不内置动画系统。常见做法：
1. 用 `setInterval` 或 `requestAnimationFrame` 定期调用 `handle.update()` 更新物体位置
2. 在 handler 中实现自定义动画逻辑

### Q: 多个卡片能不能同时显示？

可以。只要它们属于不同的 `interactiveGroup`，同一组内互斥，不同组独立。
