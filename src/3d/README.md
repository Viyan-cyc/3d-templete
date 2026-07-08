# 3D 场景集成指南

这个目录是一个**可复用的 3D 场景包**。你把它复制到你的项目（约定放在 `src/3d`），写自己的卡片样式、传一份数据，就能得到一个可交互的 3D 场景。**你不需要懂 three.js，也不需要改这个目录里的任何引擎代码。**

---

## 它能做什么

- 吃一份 JSON（`LiveDataConfig`），自动搭出场景：几何体、材质、灯光、相机、阴影、环境光。
- 之后还能**按 id 增量更新**单个物体（移动的 AGV、变色的状态、动态增删），不用重建整个场景。
- 在指定物体上挂「信息卡片」：点击弹出、同组互斥、点空白关闭，卡片定位自动跟随 3D 物体。
- 卡片的**样式由你写**（普通 React 组件），**挂在哪里由你的规则决定**。

---

## 30 秒上手（4 步）

| 步骤 | 你交付的东西 | 放在哪 |
|------|--------------|--------|
| 1 | 场景数据 JSON（几何/灯光/相机） | 后端接口 或 `public/*.json` |
| 2 | 卡片 React 组件（纯样式） | `src/components/cards/*.tsx` |
| 3 | 卡片规则 `cardRules`（物体→卡片） | `src/cards/*.ts` |
| 4 | 一个入口页（canvas + 一行调用） | `src/views/*.tsx` |

下面逐步展开。

---

## 第 1 步：提供场景数据（`LiveDataConfig`）

**数据请求由你来做**，包只接受数据。你 fetch 完传给 `createScene3D` 即可：

```ts
const data = await fetch('/api/scene').then(r => r.json())   // 你的接口
const handle = await createScene3D(canvas, data, { cardRules })

// 想用包自带的「读 url ?data= 或默认 /live-data.json」约定？可选工具：
//   import { loadLiveDataConfig } from '@/3d'
//   const data = await loadLiveDataConfig()
```

> 包**不会**自己去 fetch —— `createScene3D` 的第二个参数 `data` 是必传的。

### 数据结构

```jsonc
{
  "version": "1",
  "angleUnit": "degree",          // rotation 字段按角度还是弧度
  "scene": {
    "background": "#87CEEB",       // 背景色
    "environment": { "preset": "studio", "intensity": 1 }, // IBL 环境光强度
    "fog": { "type": "linear", "color": "#fff", "near": 10, "far": 100 }
  },
  "camera": {
    "type": "orthographic",        // "perspective" | "orthographic"
    "position": [0, 50, 50],
    "lookAt": [0, 0, 0],
    "orthographic": { "left": -70, "right": 70, "top": 70, "bottom": -70, "near": 0.1, "far": 200 },
    "perspective": { "fov": 50, "near": 0.1, "far": 100 }   // type=perspective 时用
  },
  "lights": [
    { "type": "ambient", "intensity": 0.3 },
    { "type": "hemisphere", "skyColor": "#87CEEB", "groundColor": "#8B7355", "intensity": 0.6 },
    { "type": "directional", "intensity": 1.5, "position": [50,70,50], "castShadow": true,
      "shadow": { "mapSize": 2048, "camera": { "left":-60,"right":60,"top":60,"bottom":-60,"near":0.5,"far":150 } } }
  ],
  "objects": [
    { "id": "sceneRoot", "type": "group", "parentId": null },
    { "id": "buildingA_body", "parentId": "sceneRoot", "type": "mesh",
      "geometry": { "type": "box", "params": { "width": 2, "height": 6, "depth": 2 } },
      "material": { "type": "standard", "color": "#F5F5F5", "roughness": 0.6 },
      "position": [12, 3, 0], "rotation": [0, 90, 0], "castShadow": true, "receiveShadow": true }
  ]
}
```

**物体用 `parentId` 组成树**：第一遍建节点，第二遍按 `parentId` 挂到父节点上；`parentId: null` 挂到场景根。

### 支持的类型

| 类别 | 可选值 |
|------|--------|
| 几何 `geometry.type` | `box` `plane` `sphere` `cylinder` `cone` `torus` `circle` `ring` |
| 材质 `material.type` | `standard` `phong` `basic` `physical`（支持 `transmission`/`ior`/`clearcoat`/`sheen`/`opacity`） |
| 灯光 `lights[].type` | `ambient` `hemisphere` `directional`（可带阴影） |
| 相机 `camera.type` | `perspective` `orthographic` |

> 完整字段参考 [`src/3d/utils/liveDataLoader.ts`](utils/liveDataLoader.ts) 里的 `LiveDataConfig` 系列类型。本项目 `public/live-data.json` 是一个完整示例。

---

## 第 2 步：写卡片组件

普通 React 函数组件，接收 props 渲染。除了业务 props，还会自动收到 `cardId` / `objectId`。

```tsx
// src/components/cards/BuildingCard.tsx
import React from 'react'

interface BuildingCardProps {
  cardId: string
  objectId: string
  label?: string
  occupancy?: number
}

const BuildingCard: React.FC<BuildingCardProps> = ({ label, occupancy }) => {
  return (
    <div className="card" onClick={(e) => e.stopPropagation()}>
      <strong>{label}</strong>
      <div>入驻率 {occupancy}%</div>
    </div>
  )
}

export default BuildingCard
```

---

## 第 3 步：写卡片规则（`cardRules`）

这是**唯一需要你写「映射逻辑」的地方**：告诉包「哪些物体挂哪种卡片、锚点取哪、卡片显示什么」。

```ts
// src/cards/sceneCardRules.ts
import type { CardScanRule } from '@/3d'
import BuildingCard from '@/components/cards/BuildingCard'

// 你的业务数据，按物体 id 索引（卡片要显示的非几何信息从这里来）
const biz: Record<string, { occupancy: number }> = {
  buildingA: { occupancy: 95 },
  buildingB: { occupancy: 72 },
}

export const cardRules: CardScanRule[] = [
  {
    type: 'building',          // 卡片类型 → 对应上面注册的组件
    component: BuildingCard,   // 组件随规则一起声明，会自动注册
    pattern: /^(building[A-Z])_/,  // 匹配物体 id；捕获组 [1] = 分组 id（buildingA）
    anchor: '_body',           // 卡片锚点：取 id 以 _body 结尾的物体
    offset: [0, 0.6, 0],       // 卡片相对锚点的偏移
    interactiveGroup: 'scene', // 同组互斥：同时只显示一张
    props: ({ id }) => ({      // 派生卡片 props；业务数据在这里按 id 拼进来
      label: `建筑 ${id.replace('building', '')}`,
      occupancy: biz[id]?.occupancy,
    }),
  },
]
```

### `CardScanRule` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 卡片类型，对应注册的 React 组件 |
| `component` | `ComponentType` | 该类型的 React 组件，传入即自动注册 |
| `pattern` | `RegExp` | 匹配物体的 id；**捕获组 `[1]` = 分组 id** |
| `anchor?` | `'highest' \| 'first' \| 后缀字符串 \| (meshes)=>Object3D` | 卡片定位锚点，默认 `first` |
| `offset?` | `[x,y,z]` | 卡片相对锚点偏移，默认 `[0,0.6,0]` |
| `interactiveGroup?` | `string` | 交互分组，同组点击互斥，默认全局一组 |
| `props?` | `(group) => Record` | 从分组派生卡片 props，`group = { id, meshes, anchor }` |

> 卡片默认是 **click 模式**：点击物体弹出、同 `interactiveGroup` 内互斥、点空白关闭。

### ⭐ 关键契约：物体 `id` 是桥

包在建物体时会把 `mesh.name = object.id`，而卡片扫描是去匹配 `mesh.name`。所以：

> **你 JSON 里物体的 `id` 命名，必须和 `cardRules` 里的正则对得上。**

比如 id 叫 `buildingA_body` / `buildingA_window`，正则 `/^(building[A-Z])_/` 就能把同一栋楼的所有零件归成一组、挂一张卡片。

### 业务数据怎么进卡片

物体 JSON 里**只有几何信息**，没有业务字段。卡片要显示业务数据（入驻率、温度、库存…）有两种做法：

- **推荐**：像上面那样，在 `props` 回调里按 `id` 从你自己的数据源 join 进来。
- 想让业务数据随 JSON 一起声明进来？目前 `LiveDataObject` 没有 `props`/`userData` 透传字段，需要包那边加一个增强（见文末）。

---

## 第 4 步：入口页

基本照抄即可，引擎细节都在 `createScene3D` 里：

```tsx
// src/views/Scene3D.tsx
import React, { useRef, useState, useEffect } from 'react'
import { createScene3D, CardHost, loadLiveDataConfig, type CardState } from '@/3d'
import { cardRules } from '@/cards/sceneCardRules'

const Scene3D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cardStates, setCardStates] = useState<CardState[]>([])
  const handleRef = useRef<ReturnType<typeof createScene3D> | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    ;(async () => {
      const data = await loadLiveDataConfig()
      const handle = await createScene3D(canvas, data, { cardRules })
      handle.onCardState((s) => setCardStates(s))
      handleRef.current = handle
    })()
    return () => handleRef.current?.dispose()
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

就这些。`<CardHost>` 负责把你的卡片组件渲染到正确位置，`createScene3D` 负责引擎循环、环境光、控制器、相机、resize、销毁。

---

## 增量更新（按 id 增删改物体）

拿到 `handle` 后，随时可以按 id 增删改单个物体，**不用重建整个场景**：

```ts
handle.update({
  objects: {
    // 增/改：id 已存在就**就地补丁**（保留身份，移动/换色不闪烁）；不存在则创建并按 parentId 挂父
    upsert: [
      { id: 'agv01', parentId: 'sceneRoot', type: 'mesh',
        geometry: { type: 'box', params: { width: 1, height: 1, depth: 2 } },
        material: { type: 'standard', color: '#e94560' },
        position: [5, 0.5, 5] },
    ],
    // 删：按 id
    remove: ['agv02'],
  },
})
```

行为说明：
- **就地补丁**：对已存在的 mesh，传 `position`/`rotation`/`scale` 更新变换；传 `material` 重建材质（换色/换质感）；传 `geometry` 重建几何；**不想改的字段不传即可**（`id`/`type` 是对象结构必填，照抄原对象即可）。Object3D 身份不变，卡片锚点跟随、不抖动。
- **卡片自动同步**：增删改若影响某个卡片分组（按 `cardRules` 的正则归组），该分组会重建——目标物体与 props 按当前场景重算。代价：受影响分组若卡片正打开会被重置为隐藏。
- 只支持物体级。换相机/灯光/背景这种整块改动仍走 `dispose()` + 重新 `createScene3D`。

---

## API 速查

都从 `@/3d` 导入。

### `createScene3D(canvas, data, options?) → Scene3DHandle`

同步返回，`data` 必传（包不请求）。

| `options` | 说明 |
|-----------|------|
| `cardRules?: CardScanRule[]` | 卡片规则 |
| `container?: HTMLElement` | 卡片层挂载容器，默认 `canvas.parentElement` |
| `controls?: { minDistance?, maxDistance?, maxPolarAngle?, target? }` | OrbitControls 配置 |
| `debug?: boolean` | 显示网格/坐标轴，默认 `false` |
| `enableShadows?: boolean` | 阴影开关，默认 `true` |

### `Scene3DHandle`

| 成员 | 说明 |
|------|------|
| `app` | 引擎实例（一般不用碰） |
| `cardManager` | 卡片管理器，可手动 `showCard/hideCard/showByType/...` |
| `controls` | OrbitControls 实例，可编程式控制相机（`controls.target.set(...)` 等） |
| `onCardState(cb)` | 订阅卡片状态变化，喂给 `<CardHost cards={...}>` |
| `update(patch)` | 物体级增量更新（按 id 增删改），见上「增量更新」 |
| `dispose()` | 销毁，释放 GPU/DOM/事件资源 |

### 组件 / 工具

- `<CardHost cards={cardStates} />` — 卡片宿主，`registry` 可选（默认全局注册表）
- `cardComponentRegistry.register(type, component)` — 手动注册卡片组件（用 `cardRules.component` 则无需手动注册）
- `scanAndRegisterCards(scene, cardManager, rules)` — 卡片扫描器（`createScene3D` 内部已调用，一般不直接用）
- 类型：`LiveDataConfig`、`LiveDataObject`、`CardScanRule`、`CardState`、`Scene3DOptions`、`Scene3DHandle`、`SceneUpdatePatch`、`OrbitControlsInstance`

---

## 进阶 & 注意事项

### 正交相机的 controls 坑
`minDistance` / `maxDistance` 只对**透视相机**的 dolly 生效；正交相机滚轮缩放改的是 `camera.zoom`，受 `minZoom` / `maxZoom` 约束。所以如果你的 `camera.type` 是 `orthographic`，想限制缩放要用 `minZoom`/`maxZoom`，`maxPolarAngle` 则两种相机都生效（防止轨道穿到地下）。

### 切换相机/灯光/背景
`update()` 只支持物体级。要换相机、灯光或背景这种整块改动，`dispose()` 后重新 `createScene3D(canvas, newData, ...)`。

### 编程式控制相机
拿到 `handle.controls` 后可以 `controls.target.set(x,y,z)` + `controls.update()` 做聚焦/平移动画；相机位置走 `handle.app.camera`。

### 卡片交互模式
扫描出来的卡片统一是 click 模式。如果你需要「常显」或「hover」模式，目前 `CardScanRule` 没暴露 `mode`，需要包那边支持。

---

## 你不需要关心的（包内部）

这些都被 `createScene3D` 封装了，复制目录后**不要改**：渲染循环（`App3D`）、PMREM 环境光、`OrbitControls`、CSS2D 卡片定位层、相机替换/resize、资源销毁。你只和 `createScene3D` + `cardRules` + 卡片组件打交道。

---

## 还可以增强的点（按需向包维护者提）

- `LiveDataObject` 加 `props`/`userData` 透传，让业务数据随 JSON 声明进来，卡片 `props` 回调可直接读到（免去外部按 id join）。
- `CardScanRule` 加 `mode` 字段，支持 `always` / `hover` 卡片。
- `update()` 支持 scene/camera/lights 整块替换，以及更新时保留卡片可见性。
