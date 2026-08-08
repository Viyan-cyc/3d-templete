# 3D 场景开发文档

> 本文档面向 **3D 引擎开发者**——需要在本工程中添加新组件、新材质、新交互逻辑的开发人员。
> 如果你只是想把 3D 场景集成到自己的产品里，请阅读 [集成文档](./INTEGRATION_GUIDE.md)。

---

## 目录

1. [工程总览](#1-工程总览)
2. [目录结构](#2-目录结构)
3. [核心数据流](#3-核心数据流)
4. [添加新组件（Component + Handler）](#4-添加新组件component--handler)
5. [添加新业务 Handler](#5-添加新业务-handler)
6. [使用外部模型（GLB/GLTF）](#6-使用外部模型glbgltf)
7. [材质系统](#7-材质系统)
8. [交互系统](#8-交互系统)
9. [卡片系统（CSS2D）](#9-卡片系统css2d)
10. [增量更新（upsert/remove）](#10-增量更新upsertremove)
11. [3d-components 桥接](#11-3d-components-桥接)
12. [场景预设](#12-场景预设)
13. [运行时数据轮询（LiveDataPoller）](#13-运行时数据轮询livedatapoller)
14. [编辑态 iframe 嵌入（postMessage 桥）](#14-编辑态-iframe-嵌入postmessage-桥)
15. [开发规范与约定](#15-开发规范与约定)

---

## 1. 工程总览

本工程是一个 **数据驱动** 的 3D 场景引擎，核心思想：

```
LiveDataConfig (JSON)  →  scene 层解析  →  Three.js 场景  →  CSS2D 卡片层
```

- **输入**：一份 `LiveDataConfig` JSON（声明场景里有哪些物体、长什么样、怎么组织层级）
- **输出**：一个完整的 Three.js 场景 + CSS2D 信息卡片
- **增量**：运行时可通过 `handle.update(patch)` 按物体 id 做 **增/删/改**

引擎循环、PMREM 环境光、OrbitControls、相机生命周期、CSS2D 渲染、resize、dispose 全部封装在 `createScene3D` 中，业务方无需感知。

### 四层创建链

物体创建走一条清晰的四层链：

```
data (LiveDataObject)
  → manager (ComponentManager 按 kind 链分派)
    → handlers (creation chain: library > example > model > primitive > group)
      → components (new XxxComponent(opts) / createComponentObject)
```

- **manager 层**：`ComponentManager` 按优先级遍历「创建 kind 链」，首个 `match` 命中且 `create` 返回非 null 的 handler 胜出
- **handler 层**：薄，只负责把 `LiveDataObject` 翻译成 `ComponentOptions`（`toOptions`）再 `new XxxComponent(opts)`
- **components 层**：`THREE.Mesh`/`THREE.Group` 子类，构造器里建内容 + 应用 transform/shadow

---

## 2. 目录结构

```
src/
├── 3d/                              # 3D 引擎核心（框架无关）
│   ├── index.ts                     # 统一出口，导出所有公共 API
│   ├── createScene3D.ts             # 主入口函数 createScene3D() + Scene3DHandle/Options
│   ├── App3D.ts                     # WebGL 渲染引擎封装（renderer/scene/camera/RAF/resize）
│   │
│   ├── scene/                       # 场景层（环境 + 物体生命周期）
│   │   ├── index.ts                 # 出口 + applyLiveDataToApp 编排
│   │   ├── loader.ts                # LiveDataConfig 类型定义 + loadLiveDataConfig（URL 取 JSON）
│   │   ├── environment.ts           # 场景环境：背景/雾/相机/灯光/PMREM
│   │   ├── objects.ts               # 物体生命周期：buildObjects/upsert/remove/loadModelObjects
│   │   └── presets.ts               # 场景预设（dark/outdoor/industrial/studio）+ mergeWithPreset
│   │
│   ├── components/                  # 组件层（三种组件来源都在此）
│   │   ├── index.ts                 # 出口 + registerAllComponents()
│   │   ├── AssetPool.ts             # Geometry/Material 缓存池（同参数共享实例）
│   │   ├── library-bridge.ts        # @cyc/3d-components 的 type→Ctor 映射（自动扫描）
│   │   ├── base/                    # 本地通用底座（无业务属性）
│   │   │   ├── index.ts             # 底座出口
│   │   │   ├── types.ts             # ComponentOptions（handler→组件的统一 options）
│   │   │   ├── Primitive.ts         # PrimitiveComponent（box/plane/.../ring 统一类）
│   │   │   ├── Text.ts              # TextComponent（canvas 贴图文字）
│   │   │   ├── Model.ts             # ModelComponent（带 src 的占位 Group）
│   │   │   ├── geometry.ts          # createGeometry（8 种基础几何体）
│   │   │   ├── transform.ts         # applyTransform / applyShadow / parseVec3
│   │   │   └── assets.ts            # 组件层共享的 AssetPool 单例
│   │   └── exampleField/            # 本地垂域组件
│   │       ├── index.ts
│   │       └── example.ts           # ExampleComponent（纯展示：模型 + 主题材质由 exampleHandler 加载传入）
│   │
│   ├── managers/                    # 管理器
│   │   ├── index.ts
│   │   ├── card/                    # 卡片管理器（框架无关）
│   │   │   ├── index.ts
│   │   │   ├── CardManager.ts       # CSS2D 卡片生命周期 + 交互 + scanAndRegisterCards
│   │   │   ├── CardRegistry.ts      # 卡片组件 → 卡片类型 注册表（泛型）
│   │   │   └── types.ts             # CardDef / CardState / CardScanRule / CardScanGroup
│   │   └── component/               # 业务组件管理器
│   │       ├── index.ts
│   │       ├── ComponentManager.ts  # 创建 kind 链分派（create/update/delete）
│   │       └── handlers/            # handler 实现
│   │           ├── index.ts         # 创建 kind 链定义 + registerComponentHandlers
│   │           ├── base/            # 通用 handler
│   │           │   ├── shared.ts    # ComponentSharedState（跨 handler 共享状态，当前为空占位）
│   │           │   ├── options.ts   # toOptions：LiveDataObject → ComponentOptions
│   │           │   ├── library.ts   # libraryHandler（3d-components 组件）
│   │           │   ├── model.ts     # modelHandler（带 src 的占位 Group）
│   │           │   ├── primitive.ts # primitiveHandler（基础几何体 + 文字）
│   │           │   └── group.ts     # groupHandler（空 Group）
│   │           └── exampleField/
│   │               └── example.ts   # exampleHandler（克隆 example.glb + copy 取主题材质，传给 ExampleComponent）
│   │
│   ├── models/                      # 模型资产 + 加载
│   │   ├── registry.ts              # 本地模型注册表（Vite ?url）+ resolveModelSrc
│   │   ├── loader.ts                # ModelLoader provider 链（asset/http/hunyuan）
│   │   └── hunyuan.ts               # 混元生成 provider（单次生成 + 缓存）
│   │
│   ├── interaction/
│   │   └── picker.ts                # ScenePicker（编辑态拾取，仅 interactive:true）
│   │
│   ├── bridge/
│   │   └── postMessage-host.ts      # embed.vue 与宿主的 postMessage 协议桥
│   │
│   ├── controls/
│   │   └── OrbitControls.ts         # createOrbitControls 封装
│   │
│   ├── loaders/
│   │   └── AssetLoader.ts           # GLTFLoader / TextureLoader / RGBELoader 封装（单例）
│   │
│   └── debug/
│       ├── index.ts
│       └── DebugOverlay.ts          # HUD 面板（FPS/triangles/calls）
│
├── adapters/                        # 框架适配层（与 3d/ 解耦）
│   ├── vue/                         # Vue 适配
│   │   ├── index.ts                 # 出口（CardHost）
│   │   ├── CardHost.vue             # 卡片宿主（Teleport 到 CSS2DObject 的 DOM）
│   │   └── sceneCardRules.ts        # 业务卡片规则（CardScanRule<Component>）
│   └── live-data/                   # 运行时数据轮询适配（框架无关）
│       ├── index.ts
│       └── LiveDataPoller.ts        # 定时请求 → SceneUpdatePatch → handle.update
│
├── components/
│   └── cards/                       # 卡片 Vue 组件
│       └── InfoCard.vue             # 通用信息卡片（树/建筑）
│
├── views/                           # 页面入口
│   ├── Scene3D.vue                  # 生产/交付入口（/ 路由，可选 ?update= 轮询）
│   └── embed.vue                    # 预览/编辑入口（/embed 路由，postMessage 桥 + picker）
│
├── network/
│   └── request.ts                   # axios 封装（拦截器 + get/post）
│
├── router/
│   └── index.ts                     # vue-router：/ → Scene3D，/embed → embed
│
├── App.vue                          # <router-view />
└── main.ts                          # createApp + router + mount
```

---

## 3. 核心数据流

```
┌────────────────────────────────────────────────────────────────────┐
│  业务方                                                            │
│                                                                    │
│  ① fetch('/api/scene') → LiveDataConfig JSON                      │
│     （或用包内工具 loadLiveDataConfig() 从 ?fetch= 读 JSON）        │
│  ② cardRules: CardScanRule[]  ← 业务定义哪些物体挂什么卡片           │
│  ③ const handle = createScene3D(canvas, data, { cardRules })      │
│  ④ handle.onCardState(cb)   ← 接收卡片状态，喂给 <CardHost>（适配层）│
│  ⑤ handle.update(patch)     ← 运行时增量更新                       │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────────┐
│  createScene3D 内部流程                                             │
│                                                                    │
│  1. registerComponentHandlers()  ← 注册创建 kind 链 + initLibraryBridge│
│  2. new App3D({ canvas })        ← WebGL 引擎                      │
│  3. applyLiveDataToApp(app, data, { preset })                     │
│     ├─ mergeWithPreset()         ← 数据缺值时回落预设               │
│     ├─ applyEnvironment()        ← 背景/雾/相机/灯光/PMREM          │
│     └─ buildObjects()            ← 全量建物体（两遍：create → 挂父） │
│         └─ componentManager.create(data, ctx)                     │
│             按 kind 链优先级遍历：                                  │
│             ① library  component.type + hasComponent → libraryHandler│
│             ② example  component.type==='example'    → exampleHandler │
│             ③ model    src                          → modelHandler  │
│             ④ primitive geometry / type==='mesh'    → primitiveHandler│
│             ⑤ group     type==='group'              → groupHandler  │
│         创建成功后盖 userData.__id / __componentType                │
│  4. createOrbitControls()        ← 轨道控制器（相机替换后创建）     │
│  5. new CardManager() + scanAndRegisterCards()  ← CSS2D 卡片层      │
│  6. 接入 App3D 渲染循环（update → WebGL render → CSS2D post-render）│
│  7. loadModelObjects()           ← 异步加载外部模型到占位 Group      │
│  8. setupUpdatables()            ← 收集 IUpdatable（如 HeatMesh）   │
│  9. setupInteractive()           ← （仅 interactive:true）picker/飞入/主题│
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. 添加新组件（Component + Handler）

### 4.1 新架构：组件类 + Handler + 链项

新架构下，添加一个 `component.type` 驱动的内置组件需要三样东西：

1. **组件类**（`THREE.Mesh`/`THREE.Group` 子类）：在构造器里建内容、应用 transform/shadow
2. **Handler**（`ComponentHandler`）：把 `LiveDataObject` 翻译成 `ComponentOptions` 再 `new` 组件
3. **链项**（`CreationEntry`）：在创建 kind 链里登记 `{ key, match, handler }`

> 与旧版 builder 的区别：旧版是「纯函数 + ComponentRegistry 注册」，新版是「组件类 + handler + kind 链」。创建逻辑收敛到组件类构造器，handler 只做翻译。

### 4.2 创建步骤

以新增一个 `conveyor`（传送带）垂域组件为例。

**第一步**：在 `src/3d/components/` 下对应垂域子目录新建组件类。

若没有合适的垂域目录，新建一个（如 `industrial/`）：

```ts
// src/3d/components/industrial/conveyor.ts

import * as THREE from 'three';
import type { ComponentOptions } from '../base/types';
import { getResourceManager } from '../../resources';
import { assetPool } from '../base/assets';
import { applyTransform, applyShadow } from '../base/transform';

/**
 * Conveyor 传送带组件 —— extend THREE.Group，构造器里建内容。
 * 子 mesh 带 name，构造末尾据此写子节点 userData.id 供 parentId 引用 + raycast 识别。
 */
export class ConveyorComponent extends THREE.Group {
  constructor(opts: ComponentOptions) {
    super();
    const p = opts.params ?? {};
    const length = Number(p.length) > 0 ? Number(p.length) : 4;
    const width  = Number(p.width)  > 0 ? Number(p.width)  : 1;
    const height = Number(p.height) > 0 ? Number(p.height) : 0.5;
    const mat = getResourceManager().createMaterialFromLive(opts.material);

    // 主带面：用 assetPool.getGeometry 缓存，相同参数只创建一次
    const beltGeo = assetPool.getGeometry(
      `conveyor:belt:${length},${width},${height}`,
      () => new THREE.BoxGeometry(length, height * 0.3, width),
    );
    const belt = new THREE.Mesh(beltGeo, mat);
    belt.name = 'belt';
    belt.position.y = height * 0.85;
    belt.castShadow = true;
    this.add(belt);

    // 侧栏（复用同一几何体）
    const railGeo = assetPool.getGeometry(
      `conveyor:rail:${length},${height}`,
      () => new THREE.BoxGeometry(length, height, width * 0.05),
    );
    for (const [side, z] of [['left', width / 2], ['right', -width / 2]] as const) {
      const rail = new THREE.Mesh(railGeo, mat);
      rail.name = `${side}Rail`;
      rail.position.set(0, height * 0.5, z);
      this.add(rail);
    }

    // name + transform + shadow + 子节点 userData.id
    if (opts.id) {
      this.name = opts.id;
    }
    applyTransform(this, opts);
    applyShadow(this, opts);
    const prefix = opts.id ?? '';
    for (const child of this.children) {
      child.userData.id = `${prefix}_${child.name}`;
    }
  }
}
```

```ts
// src/3d/components/industrial/index.ts
export { ConveyorComponent } from './conveyor';
```

**第二步**：在 `src/3d/managers/component/handlers/` 下对应子目录新建 handler。

```ts
// src/3d/managers/component/handlers/industrial/conveyor.ts
import type * as THREE from 'three';
import type { ComponentHandler, ComponentContext } from '../../ComponentManager';
import type { LiveDataObject } from '../../../../scene/loader';
import { ConveyorComponent } from '../../../../components/industrial';
import { applyTransform } from '../../../../components';
import { toOptions } from '../base/options';

export const conveyorHandler: ComponentHandler = {
  create(data: LiveDataObject) {
    return new ConveyorComponent(toOptions(data));
  },

  // 可选：就地更新（结构参数变化时重建子节点，见 §5.3 通用 update 写法）
  update(obj: THREE.Object3D, data: LiveDataObject, _ctx: ComponentContext): boolean {
    // 仅改 transform 时可直接回落默认 patchObject（return false）；
    // 若 params 变化需要重建子节点，参考通用 update 写法（见 §5.3）。
    applyTransform(obj, data);
    return true; // 已处理，跳过默认 patchObject
  },
};
```

**第三步**：在创建 kind 链里登记。编辑 [handlers/index.ts](../src/3d/managers/component/handlers/index.ts)：

```ts
import { conveyorHandler } from './industrial/conveyor';

const creationChain: CreationEntry[] = [
  { key: 'library',   match: (d) => hasComponent(d.component?.type ?? ''), handler: libraryHandler },
  { key: 'example',   match: (d) => d.component?.type === 'example',   handler: exampleHandler },
  { key: 'conveyor',  match: (d) => d.component?.type === 'conveyor',  handler: conveyorHandler }, // ← 新增
  { key: 'model',     match: (d) => Boolean(d.src),                    handler: modelHandler },
  { key: 'primitive', match: (d) => Boolean(d.geometry) || d.type === 'mesh', handler: primitiveHandler },
  { key: 'group',     match: (d) => d.type === 'group',                handler: groupHandler },
];
```

> **链顺序很重要**：`match` 按数组顺序遍历，首个命中且 `create` 返回非 null 者胜出。`conveyor` 必须排在 `primitive`/`group` 之前，否则会被它们抢先匹配。

**第四步**：在 `LiveDataConfig` 的 JSON 中使用。

```json
{
  "id": "conveyor01",
  "type": "component",
  "parentId": "factoryZone",
  "component": {
    "type": "conveyor",
    "params": { "length": 6, "width": 1.2, "height": 0.6 }
  },
  "material": { "type": "standard", "color": "#888888", "roughness": 0.6, "metalness": 0.3 },
  "position": [10, 0, 5]
}
```

### 4.3 组件类约定

- **必须 extend `THREE.Mesh` 或 `THREE.Group`**（组件类就是 Three 对象本身，没有包装层）
- 构造器签名固定：`constructor(opts: ComponentOptions)`
- 在构造器里：建内容 → `applyTransform(this, opts)` → `applyShadow(this, opts)` → 给子节点写 `userData.id = ${prefix}_${child.name}`
- 使用 `assetPool.getGeometry(key, factory)` 缓存几何体；材质走 `getResourceManager().createMaterialFromLive(opts.material)`（贴图经 AssetCache 去重）
- 子 mesh 带 `name`（如 `belt`、`body`），供 `parentId` 引用、raycast 识别、卡片锚点选取
- **外部模型/贴图组件的另一模式**：若组件用外部 glb + 贴图（如 `ExampleComponent`），资源创建不放构造器——handler `cloneModel` 取模型 + `copy`/`clone` 取主题材质（MaterialManager 管理，支持 `setTheme` 换肤；贴图作为 `map:{url}` 写在 register-materials 的 themes 里），通过 `setResources(model, material)` 异步传入；组件保持纯展示。详见 [exampleField/example.ts](../src/3d/components/exampleField/example.ts) 与对应 [handler](../src/3d/managers/component/handlers/exampleField/example.ts)
- **纯色材质（无贴图）**：`MaterialConfig` 去掉 `map` 字段、用 `color` 配色即可（register-materials 的 `exampleFlat` 即此）；handler 里把 `copy`/`clone` 的 key 换成 `'exampleFlat'` 即用纯色材质

### 4.4 ComponentOptions

handler 拿到 `data` 后用 `toOptions(data)` 翻译成统一 options，再 `new XxxComponent(opts)`：

```ts
// src/3d/components/base/types.ts
interface ComponentOptions {
  id?: string
  geometry?: LiveDataGeometry
  material?: LiveDataMaterial
  params?: Record<string, number | string>   // 来自 component.params
  position?: number[]
  rotation?: number[]
  scale?: number[]
  castShadow?: boolean
  receiveShadow?: boolean
  src?: string                                // type='glb'/'model'
}
```

---

## 5. 添加新业务 Handler

### 5.1 Handler 是什么

Handler 是挂在 `ComponentManager` 上的 **创建 kind 链分派器**。`ComponentManager.create` 按链优先级遍历，首个 `match` 命中且 `create` 返回非 null 的 handler 胜出。

每个 handler 实现 `ComponentHandler` 接口，可只实现关心的操作：

```ts
// src/3d/managers/component/ComponentManager.ts
interface ComponentHandler {
  /** 创建：返回 Object3D，null 表示未处理（回落 kind 链下一项） */
  create?: (data: LiveDataObject, ctx: ComponentContext) => THREE.Object3D | null

  /** 更新：返回 true 表示已处理，false 回落 defaultFn（patchObject） */
  update?: (obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) => boolean

  /** 删除：返回 true 表示已处理，false 回落 defaultFn（disposeObject） */
  delete?: (obj: THREE.Object3D, ctx: ComponentContext) => boolean
}

interface ComponentContext {
  scene: THREE.Scene
  index: ObjectIndex                    // id → Object3D 的全局索引
  shared: ComponentSharedState          // 跨 handler 共享状态
}
```

### 5.2 创建步骤

参见 [§4.2](#42-创建步骤)——新组件类 + handler + 链项三件套。若只想为已有组件类加业务逻辑（状态变色、动画等），在 handler 的 `update`/`delete` 里实现即可，不必新建组件类。

### 5.3 就地更新示例（通用写法，参考已删除的 rackHandler）

当组件的 **结构参数** 变化时，默认 `patchObject` 只能改 transform/material/geometry，改不了结构——此时 handler 自行重建子节点：

```ts
// 注：此为「组件有结构参数需同步重建」的通用写法，适用于构造器内建内容的组件（如已删除的 rack）。
// ExampleComponent 的资源由 handler 异步加载（setResources）且无结构参数，不走此写法——
// 其结构变更应直接 remove 旧对象 + 经 handler 重新 create。
// 通用 update 写法（参考已删除的 rackHandler）
update(obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext): boolean {
  // 用新 params 重建一个组件实例（构造器内同步建内容）
  const fresh = new ConveyorComponent(toOptions(data));

  // 旧子节点：从 index 移除并脱离父（缓存资源不 dispose，避免误释放共享资源）
  for (const child of Array.from(obj.children)) {
    if (child.userData?.id) ctx.index.delete(child.userData.id);
    obj.remove(child);
  }

  // 新子节点：搬入现有节点并注册进 index
  for (const child of Array.from(fresh.children)) {
    obj.add(child);
    if (child.userData?.id) ctx.index.set(child.userData.id, child);
  }

  applyTransform(obj, data);   // transform 应用到现有节点
  return true;                 // 已处理，跳过默认 patchObject
}
```

### 5.4 共享状态

所有 handler 通过 `ctx.shared` 访问同一个 `ComponentSharedState` 实例（[handlers/base/shared.ts](../src/3d/managers/component/handlers/base/shared.ts)）。

> 当前为**空占位**：`dispose()` 空实现，无字段。待真正有跨 handler 状态需求（如全局颜色映射、材质缓存、选中态）时再在 `ComponentSharedState` 类中加属性。新增字段后所有 handler 即可通过 `ctx.shared.xxx` 访问。

### 5.5 类型匹配规则

创建走 kind 链的 `match` 函数（按 data 形状判断）——`component.type` 命中 library-bridge 走库，否则查垂域 type 链：

| kind | match 条件 | handler | 说明 |
|------|-----------|---------|------|
| `library` | `component.type` 存在且 `hasComponent(type)` | libraryHandler | 3d-components 组件，优先级最高 |
| `example` | `component.type === 'example'` | exampleHandler | 内置垂域组件 |
| `model` | `src` 存在 | modelHandler | 带 src 的占位 Group（异步填充） |
| `primitive` | `geometry` 存在 或 `type === 'mesh'` | primitiveHandler | 基础几何体 + 文字 |
| `group` | `type === 'group'` | groupHandler | 空 Group |

```jsonc
// 匹配 library 的写法（component.type 命中 library-bridge）
{ "component": { "type": "HeatMesh", "params": { ... } } }

// 匹配 example 的写法（component.type==='example'）
{ "component": { "type": "example" } }

// type 未命中 library-bridge 时回落：先查垂域 type 链，再 src，再 geometry
{ "component": { "type": "NotExists" } }  // 不命中库 → 回落查 type 链（example 等）
```

---

## 6. 使用外部模型（GLB/GLTF）

### 6.1 模型加载机制

模型走 `ModelLoader` provider 链（[models/loader.ts](../src/3d/models/loader.ts)），按 `src` 前缀路由：

| 前缀 | Provider | 说明 |
|------|----------|------|
| `asset:xxx` | assetProvider | 本地 `modelRegistry`（Vite ?url）+ GLTFLoader |
| `http(s)://...` | httpProvider | 远程 URL + GLTFLoader |
| `hunyuan:xxx` | hunyuanProvider | 混元 AI 生成（单次生成 + 缓存，当前占位 throw） |

所有 provider 内置 **原型缓存 + clone(true)** 复用：同一 URL 只 parse 一次，后续实例 clone。

### 6.2 在 JSON 中引用模型

```json
{
  "id": "example01",
  "type": "glb",
  "parentId": "farmZone",
  "src": "asset:example",
  "position": [10, 0, 5],
  "castShadow": true,
  "receiveShadow": true
}
```

加载流程：
1. `buildObjects` 阶段 `modelHandler` 创建 **占位 Group**（`ModelComponent`，占住位置和层级）
2. 渲染循环已启动
3. `loadModelObjects()` 异步加载，填充到占位 Group 中
4. 加载失败 → 放一个红色 box 兜底，不阻塞其余物体

### 6.3 注册本地模型

在 [models/registry.ts](../src/3d/models/registry.ts) 中添加条目。模型文件放在 **`src/3d/assets/models/`** 目录下，用 Vite `?url` 导入：

```ts
// src/3d/models/registry.ts
import exampleUrl from './example.glb?url';   // ← 模型文件在 src/3d/assets/models/

export const modelRegistry: Record<string, string> = {
  example: exampleUrl,
  // 新增模型在这里加
};
```

`src` 解析（`resolveModelSrc`）：
- `asset:example` → 去掉前缀查 `modelRegistry['example']`，拿到带 hash 的编译 URL
- `/models/xxx.glb` 或 `https://...` → 原样作为 URL

---

## 7. 材质系统

### 7.1 LiveDataMaterial 类型

```ts
// src/3d/scene/loader.ts
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

### 7.2 材质工厂与缓存

模式A 内联材质（数据 `material` 字段）由 [ResourceManager](../src/3d/resources/ResourceManager.ts) 创建：

- `createMaterialFromLive(matDef)` — 从 LiveDataMaterial 建（`undefined` 回落 `MeshNormalMaterial`），内部转 MaterialConfig 后建实例
- `createMaterial(config)` — 从 MaterialConfig 直接建实例

类型分发与属性写入复用 3d-components 的 `createMaterial` / `applySyncProps`（standard / basic / physical / phong / lambert），未知 `type` 回落 `MeshStandardMaterial`。贴图（`map` 等槽位）经 AssetCache 异步回填到同一材质实例、按 URL 去重缓存；材质实例本身不缓存（每次 `new`，模式A 场景量小无需去重）。

需换肤联动的材质走模式B（[register-materials](../src/3d/resources/register-materials.ts) 注册，`copy`/`clone` 取用，`setTheme` 原地改写），见 §7.5。

### 7.3 在 JSON 中写材质

```jsonc
// 普通漫反射
{ "type": "standard", "color": "#e0e0e0", "roughness": 0.7, "metalness": 0.1 }

// 半透明
{ "type": "standard", "color": "#2a5ad9", "transparent": true, "opacity": 0.15 }

// 玻璃
{ "type": "physical", "color": "#ffffff", "roughness": 0, "metalness": 0, "transmission": 0.9, "ior": 1.5, "thickness": 0.5 }

// 自发光（不响应光照）
{ "type": "basic", "color": "#fff8dc" }

// Phong（高光反射，复古/低代价）
{ "type": "phong", "color": "#e0e0e0" }
```

### 7.4 在代码中动态换材质

在 handler 的 `update` 中，用 ResourceManager 的 `createMaterialFromLive`（模式A，从数据 `material` 字段）生成材质并应用到子树：

```ts
import type * as THREE from 'three';
import type { ComponentContext } from '../../ComponentManager';
import type { LiveDataObject } from '../../../../scene/loader';

// handler 对象的 update：
update(obj: THREE.Object3D, data: LiveDataObject, ctx: ComponentContext) {
  if (data.material) {
    const mat = ctx.shared.resources.createMaterialFromLive(data.material);
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        const old = mesh.material;
        if (Array.isArray(old)) old.forEach((m) => m.dispose());
        else old?.dispose();
        mesh.material = mat;
      }
    });
  }
  return true;
}
```

### 7.5 主题材质：copy vs clone（模式B）

走 MaterialManager 的主题材质（[register-materials](../src/3d/resources/register-materials.ts) 注册），handler 用 `copy` / `clone` 取用（对齐 MaterialManager，引用不变、换肤原地改写）：

```ts
const res = getResourceManager();
// copy：多实例共享同一材质，setTheme 换肤联动 —— 适合「同款组件统一换肤」
res.copy('example', (mat) => { mesh.material = mat; });
// clone：各实例独立材质，改色不串 —— 适合「同款组件各自配色」
res.clone('example', (mat) => { mesh.material = mat; });
// clone + 独立贴图：连贴图也独立，可各自改 repeat / offset / colorSpace
res.clone('example', (mat) => { mesh.material = mat; }, false);
```

引用不变：copy / clone 返回的材质在换肤时都被 MaterialManager 原地改写，`mesh.material = mat` 赋一次即可。

模型克隆粒度（`cloneModel` 的 `clone` 选项，透传 `AssetCache.cloneModel`）：

```ts
// 默认全共享（几何 / 材质 / 贴图，最省内存）
res.cloneModel('asset:example');
// 独立材质（改色不影响其他实例）
res.cloneModel('asset:example', { clone: { shareMaterial: false } });
// 全独立（几何 / 材质 / 贴图都独立，可独立变形）
res.cloneModel('asset:example', { clone: { shareGeometry: false, shareMaterial: false, shareTexture: false } });
```

> [exampleHandler](../src/3d/managers/component/handlers/exampleField/example.ts) 在调用处注释了这两个选择点，默认 copy + 全共享，按需切换。

---

## 8. 交互系统

### 8.1 运行态交互（CSS2D 卡片点击）

在 `createScene3D` 默认模式（`interactive: false`）下：
- 点击 3D 物体 → 射线检测 → 命中卡片 → 显示/隐藏卡片
- 同组互斥：同一 `interactiveGroup` 内只显示一张卡片
- 点击空白处 → 隐藏所有 click 模式卡片

此交互由 `CardManager` 自动处理（[managers/card/CardManager.ts](../src/3d/managers/card/CardManager.ts)），不需要额外开发。拖拽与点击按像素阈值（默认 5px）区分，避免 OrbitControls 旋转松手时误触。

### 8.2 编辑态交互（ScenePicker）

当 `interactive: true` 时启用 `ScenePicker`（[interaction/picker.ts](../src/3d/interaction/picker.ts)）：

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

所有由 `ComponentManager.create` 创建的物体都在 `userData.__id` 中写入 JSON 中的 `id`，并在 `userData.__componentType` 写入创建它的 kind 链 key：

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
- `userData.__zone` — 分区标记（`whole` 选中模式使用；权威源是 JSON 的 `__zone` 字段）
- `userData.__logicalRoot` — 逻辑物体根标记（zone 的直接子，用户视角的"一个整体"）
- `userData.__componentType` — 创建它的 kind 链 key（`delete` 分派使用）
- `userData.__updatable` — IUpdatable 标记（有 `update(delta)` 方法的 3d-components 组件）

---

## 9. 卡片系统（CSS2D）

### 9.1 卡片流程

```
JSON 中物体 id  →  CardScanRule.pattern 匹配  →  分组  →  CardManager.addCard()
                                                            ↓
                                                     CSS2DObject 挂到锚点
                                                            ↓
                                                     CardState[] → <CardHost>（适配层）
                                                            ↓
                                                     Teleport 到 CSS2DObject 的 DOM
                                                            ↓
                                                     <component :is="cardComponent" v-bind="props" />
```

### 9.2 创建新卡片组件

卡片就是普通的 Vue 组件，接收 `cardId`、`objectId` 和自定义 props（见 [components/cards/InfoCard.vue](../src/components/cards/InfoCard.vue)）：

```vue
<!-- src/components/cards/InfoCard.vue -->
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
  cardId: string       // 卡片 id（自动注入）
  objectId: string     // 关联的 3D 物体 id（自动注入）
  kind?: 'tree' | 'building'
  label?: string
  position?: [number, number]
  height?: number
}>()

const kind = computed(() => props.kind ?? (props.objectId?.startsWith('building') ? 'building' : 'tree'))
const label = computed(() => props.label ?? props.objectId)
const posX = computed(() => props.position?.[0]?.toFixed(1) ?? '0.0')
const posZ = computed(() => props.position?.[1]?.toFixed(1) ?? '0.0')
const height = computed(() => props.height ?? 0)
</script>
```

### 9.3 定义扫描规则

卡片注册和扫描规则绑定在一起，在 `CardScanRule` 中声明（见 [adapters/vue/sceneCardRules.ts](../src/adapters/vue/sceneCardRules.ts)）：

```ts
// src/adapters/vue/sceneCardRules.ts
import type { Component } from 'vue'
import type { CardScanRule } from '@/3d'
import InfoCard from '@/components/cards/InfoCard.vue'

const groupHeight = (meshes: { position: { y: number } }[]): number =>
  meshes.reduce((mx, m) => Math.max(mx, m.position.y), 0)

export const cardRules: CardScanRule<Component>[] = [
  {
    type: 'tree',                        // 卡片类型名
    component: InfoCard,                 // 组件（传入即自动注册，无需手动 register）
    pattern: /^(tree\d+)_/,             // 匹配 mesh.name，捕获组 [1] = 分组 id
    anchor: 'highest',                   // 锚点：取 y 最高的 mesh
    offset: [0, 0.6, 0],                 // 卡片偏移
    interactiveGroup: 'scene',           // 交互分组（同组互斥）
    props: ({ id, anchor, meshes }) => ({   // 从分组派生 props
      kind: 'tree' as const,
      label: `树 ${id.replace(/^tree/, '').padStart(2, '0')}`,
      position: [anchor.position.x, anchor.position.z] as [number, number],
      height: groupHeight(meshes),
    }),
  },
  {
    type: 'building',
    component: InfoCard,
    pattern: /^(building[A-Z])_/,
    anchor: '_body',                     // 锚点：取 name 以 _body 结尾的 mesh
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

### 9.4 CardScanRule 详解

```ts
// src/3d/managers/card/types.ts
interface CardScanRule<T = unknown> {
  type: string               // 卡片类型，对应 registry 中的 key
  component?: T              // 组件（传入即自动注册）；泛型 T 由适配层指定
  pattern: RegExp            // 匹配 mesh.name；捕获组 [1] = 分组 id
  anchor?: CardAnchorSpec    // 锚点选取方式
  offset?: [number, number, number]  // 卡片相对锚点偏移，默认 [0, 0.6, 0]
  interactiveGroup?: string  // 交互分组（同组互斥），不填默认 'scene'
  props?: (group: CardScanGroup) => Record<string, unknown>  // 派生 props
}

type CardAnchorSpec =
  | 'highest'    // 取 position.y 最大的 mesh
  | 'first'      // 取 meshes[0]（默认）
  | string       // 取 name 以该后缀结尾的 mesh（如 '_body'），找不到回退 first
  | ((meshes: THREE.Object3D[]) => THREE.Object3D)  // 完全自定义

interface CardScanGroup {
  id: string                   // 分组 id（pattern 捕获组 [1]）
  meshes: THREE.Object3D[]     // 该分组的全部关联 mesh
  anchor: THREE.Object3D       // 选出的锚点物体
}
```

### 9.5 卡片显隐模式

`scanAndRegisterCards` 生成的 `CardDef` 默认 `mode: 'click'`。如需 `always`（常显），用 `cardManager.addCard` 手动添加并在 `def.mode` 设 `'always'`：

```ts
interface CardDef {
  cardType?: string
  mode?: 'always' | 'click'   // always=常显，click=点击显示/隐藏（默认 click）
  alwaysVisible?: boolean      // 等价于 mode:'always'
  interactiveGroup?: string    // 同组互斥
  offset?: [number, number, number]  // 默认 [0, 1.5, 0]
  anchor?: Object3D
  props?: Record<string, unknown>
}
```

`CardManager` 还提供 `showCard/hideCard/toggleCard`、`showByType/hideByType`、`hideAll`、`freeze/unfreeze` 等方法，供编程式控制。

---

## 10. 增量更新（upsert/remove）

### 10.1 update 接口

```ts
// src/3d/createScene3D.ts
interface SceneUpdatePatch {
  objects?: {
    upsert?: LiveDataObject[]  // 按 id 增/改
    remove?: string[]          // 按 id 删
  }
}

// 使用
handle.update({
  objects: {
    upsert: [
      { id: 'agv01', position: [10, 0, 5] },
    ],
    remove: ['tempObj01'],
  },
})
```

### 10.2 实现位置

增量更新在 [scene/objects.ts](../src/3d/scene/objects.ts)：

- **`upsertObjects(scene, index, defs)`**：id 已存在则就地补丁，id 不存在则创建并挂父
- **`removeObjects(scene, index, ids)`**：按 id 删除（只处理显式传入的 id；删父节点需把子孙 id 一并传入）

更新通过 `ComponentManager` 分派：若该 kind 的 handler 有 `update` 且返回 true，走 handler 逻辑；否则回落默认 `patchObject`（transform/material/geometry）。

### 10.3 卡片同步

`handle.update` 在 upsert/remove 后自动调 `cardManager.refreshCards(scene, cardRules, changed)`：
1. 从变更物体的 name 中按各 `rule.pattern` 取捕获组 [1]，得到受影响的卡片分组 id
2. 移除受影响的卡片
3. 重新 `scanAndRegisterCards`（幂等：未受影响的卡片 id 已存在会被跳过）

### 10.4 更新特性

| 特性 | 说明 |
|------|------|
| **就地补丁** | 已有物体只更新变化的部分，保留 Object3D 身份，不重建不闪烁 |
| **卡片同步** | 增删物体后，受影响的卡片自动更新 |
| **handler 分派** | 该 kind 有 handler.update 且返回 true 走 handler（如组件有结构参数需重建子节点） |
| **乱序支持** | upsert 数组中子可以先于父出现，引擎第二遍统一挂父 |

---

## 11. 3d-components 桥接

### 11.1 什么是 3d-components

`@cyc/3d-components` 是独立的 3D 组件库，提供 Grid、Wall、HeatMesh、Sky 等 `THREE.Object3D` 子类。dev 阶段通过 vite alias 直引 `../3d-components/src`（见 [vite.config.ts](../vite.config.ts)），生产阶段改 `npm install @cyc/3d-components` 后移除 alias。

### 11.2 使用方式

在 JSON 中通过 `component.type` 引用：

```json
{
  "id": "heatMap01",
  "type": "component",
  "parentId": "centralZone",
  "component": {
    "type": "HeatMesh",
    "params": { "width": 10, "height": 10, "segments": 50 }
  },
  "position": [0, 0.1, 0],
  "rotation": [-90, 0, 0]
}
```

`component.type` 在创建 kind 链中优先级最高（命中 library-bridge）：`libraryHandler` 调 `createComponentObject(type, params)`（= `new Ctor(params)`），再补 name + transform + shadow。

### 11.3 自动注册

[components/library-bridge.ts](../src/3d/components/library-bridge.ts) 的 `initLibraryBridge()` 通过 `registerNamespace()` 扫描 `@cyc/3d-components/core`、`/heat`、`/material` 三个命名空间里所有 **首字母大写的 Object3D 子类**，自动建立 type→Ctor 映射。**新增 3d-components 组件无需改本工程**——只要它是 Object3D 子类且首字母大写，就会被自动注册。

> Material 子类（ShinyMaterial/MeshReflectorMaterial）不是 Object3D，暂不处理。

### 11.4 IUpdatable

3d-components 中实现了 `update(delta)` 方法的组件（如 HeatMesh），`createComponentObject` 会在 `userData.__updatable` 标记，`createScene3D` 的 `setupUpdatables()` 会将其收集并注册到渲染循环，每帧调用 `update(delta)`。

---

## 12. 场景预设

### 12.1 预设机制

数据缺 `scene` / `camera` / `lights` 时，`mergeWithPreset` 会回落到预设配置，保证不报错。内置预设（[scene/presets.ts](../src/3d/scene/presets.ts)）：

| key | 名称 | 适用 |
|-----|------|------|
| `dark`（默认） | 深色数字孪生 | 室内/数字孪生 |
| `outdoor` | 浅色户外 | 城市规划/户外 |
| `industrial` | 工业车间 | 仓库/车间 |
| `studio` | 简约白底 | 产品展示 |

```ts
// 用法
createScene3D(canvas, data, { preset: 'outdoor' })
// 数据有值的部分覆盖预设，缺值的部分回落到预设
```

### 12.2 注册自定义预设

```ts
import { registerScenePreset } from '@/3d'

registerScenePreset('night', {
  name: '夜间',
  scene: { background: '#0a0a1a', environment: { preset: 'night', intensity: 0.5 } },
  camera: { type: 'perspective', position: [10, 8, 10], lookAt: [0, 0, 0],
            perspective: { fov: 50, near: 0.1, far: 500 } },
  lights: [
    { type: 'ambient', intensity: 0.2, color: '#223355' },
    { type: 'directional', intensity: 0.8, color: '#aabbff', position: [5, 15, 5] },
  ],
})
```

### 12.3 相机合并规则

`mergeCamera` 按 `type` 只保留 `perspective` 或 `orthographic` 子字段（二者互斥）：type 缺省按 `'perspective'`；type 为 `orthographic` 但没传子字段时用预设兜底。

> 注：PMREM 环境光当前固定用 `RoomEnvironment`，`scene.environment.preset` 字段仅 `intensity` 生效（后续可按 preset 选不同环境贴图）。

---

## 13. 运行时数据轮询（LiveDataPoller）

### 13.1 作用

[adapters/live-data/LiveDataPoller.ts](../src/adapters/live-data/LiveDataPoller.ts) 是一个框架无关的轮询适配器：按固定间隔请求模拟数据，把每帧作为一个 `SceneUpdatePatch` 下发给 `handle.update`，模拟「定时请求 → 增量更新」。

### 13.2 两种模式

| 模式 | `refetch` | 数据格式 | 说明 |
|------|-----------|---------|------|
| 静态 mock（默认） | `false` | `{ intervalMs, frames: [SceneUpdatePatch, ...] }` | 一次 fetch 拿全部帧，按 intervalMs 循环下发 |
| 真实后端 | `true` | 响应体直接是一个 `SceneUpdatePatch` | 每个间隔都重新 fetch |

### 13.3 用法

```ts
import { LiveDataPoller } from '@/adapters/live-data'

const poller = new LiveDataPoller({
  url: '/api/scene/updates',           // 模拟数据 / 轮询接口地址
  intervalMs: 2000,                    // 可选，缺省取静态 mock 内 intervalMs，再缺省 2000
  onPatch: (patch) => handle.update(patch),  // 收到一帧 → 走 update
  onError: (err) => console.warn(err),
  refetch: false,                      // true=对接真实轮询接口
  loop: true,                          // 仅 refetch=false 生效，是否循环
})
await poller.start()
onUnmounted(() => poller.stop())
```

### 13.4 模板内的演示

[views/Scene3D.vue](../src/views/Scene3D.vue) 内置一个演示：URL 加 `?update=` 启动轮询（默认读 `live-data-handlers-update.json`），`?update=foo.json` 指定文件，`?interval=1000` 指定间隔。下载模板接入自己的数据时，把 `url` 换成轮询接口、去掉 `?update` 判断即可。

---

## 14. 编辑态 iframe 嵌入（postMessage 桥）

### 14.1 两个入口

| 路由 | 组件 | 用途 |
|------|------|------|
| `/` | [views/Scene3D.vue](../src/views/Scene3D.vue) | 生产/交付入口，自己 fetch 数据，可选 `?update=` 轮询 |
| `/embed` | [views/embed.vue](../src/views/embed.vue) | 预览/编辑入口，供 octoapp iframe 嵌入，`interactive: true` |

### 14.2 postMessage 协议

协议在 [bridge/postMessage-host.ts](../src/3d/bridge/postMessage-host.ts) 定义，`embed.vue` 用 `bindPostMessageHost` 绑定监听：

**宿主 → embed（父→子）**：

| 消息类型 | 字段 | 用途 |
|----------|------|------|
| `SCENE_UPDATE` | `payload: LiveDataConfig \| null` | 推送/清空整个场景 JSON |
| `SCENE_PATCH` | `payload: SceneUpdatePatch` | 增量更新物体 |
| `SCENE_PICK_MODE` | `enabled: boolean` | 开/关编辑态选中 |
| `SCENE_PICK_GRANULARITY` | `granularity: 'part' \| 'whole'` | 选中粒度 |
| `SCENE_FLY_TO` | `targetId: string` | 聚焦物体 |
| `SCENE_THEME` | `mode: 'light' \| 'dark'` | 切主题 |
| `SCENE_RESET_CAMERA` | — | 复位相机 |

**embed → 宿主（子→父）**：

| 消息类型 | 数据 | 用途 |
|----------|------|------|
| `SCENE_READY` | — | 握手（onMounted 立即发，父收到重发 pendingData） |
| `SCENE_PICK` | `{ id, name?, component?, props? }` | 选中回传 |
| `SCENE_ERROR` | `{ message }` | 解析/加载错误 |

### 14.3 扩展协议

新增消息类型时：
1. 在 `SceneHostMessage` / `SceneEmbedMessage` 联合类型加一项
2. 在 `PostMessageHostHandlers` 加对应回调
3. 在 `bindPostMessageHost` 的 `switch` 加分支
4. 在 `embed.vue` 的 `bindPostMessageHost({ ... })` 里实现回调

---

## 15. 开发规范与约定

### 15.1 命名约定

| 对象 | 约定 | 示例 |
|------|------|------|
| JSON 物体 id | camelCase，语义化 | `chubGround`, `sbdTree1Group` |
| 组件类 | PascalCase，`XxxComponent` | `ExampleComponent`, `ConveyorComponent` |
| Handler | camelCase，`xxxHandler` | `exampleHandler`, `conveyorHandler` |
| kind 链 key | camelCase | `library`, `example`, `model`, `primitive`, `group` |
| `component.type`（本仓组件） | camelCase | `example`, `conveyor` |
| `component.type`（库组件） | PascalCase（3d-components 类名） | `HeatMesh`, `Grid`, `Wall` |
| Card type | camelCase | `tree`, `building` |
| 子 mesh name | 短语义名 | `body`, `belt` |
| 子节点 userData.id | `${parentId}_${child.name}` | `example01_<meshName>` |

### 15.2 创建 kind 链优先级

```
library (component.type 命中 library-bridge)  >  example (component.type==='example')
  >  model (src)  >  primitive (geometry / mesh)  >  group
```

写 JSON 时注意：
- `component.type` 命中 library-bridge（`hasComponent` 为 true，库组件名 PascalCase）→ 走 3d-components
- `component.type` 未命中库 → 回落查垂域 type 链（当前只有 `example` 一种内置垂域）
- `component.type` 也未命中 → 回落到 `src` 走模型加载
- `src` 也没有 → 回落到 `geometry` 走原生 mesh
- 都没有且 `type:'group'` → 空 Group

### 15.3 新增文件清单

| 新增什么 | 需要改的文件 |
|----------|-------------|
| 新垂域组件 | `components/xxx/newComponent.ts`（组件类）+ `components/xxx/index.ts` 导出 + `handlers/xxx/newHandler.ts` + `handlers/index.ts` 加链项 |
| 新 Handler（已有组件类加业务逻辑） | `handlers/xxx/newHandler.ts` + `handlers/index.ts` 加链项 |
| 新模型资产 | `src/3d/assets/models/xxx.glb` + `models/registry.ts` 注册 |
| 新卡片组件 | `src/components/cards/XxxCard.vue` + `adapters/vue/sceneCardRules.ts` 加 `CardScanRule` |
| 新场景预设 | `registerScenePreset('key', { ... })` 调用（无需改源码） |
| 新 3d-components 组件 | `@cyc/3d-components` 包内开发，自动注册，无需改本工程 |
| 新 postMessage 消息 | `bridge/postMessage-host.ts` 加类型+分支 + `views/embed.vue` 实现回调 |

### 15.4 性能注意

- 几何体务必走 `assetPool.getGeometry(key, factory)`，同参数不重复创建；模式A 材质走 `ResourceManager.createMaterialFromLive`（贴图经 AssetCache 去重），换肤材质走模式B `copy`/`clone`
- 外部模型走原型缓存 + clone，同一 URL 只 parse 一次
- `IUpdatable` 组件的 `update(delta)` 应避免每帧 GC，复用对象
- 大场景中避免 `scene.traverse()` 热路径，用 `ObjectIndex`（id → Object3D Map，O(1) 查找）
- handler 的 `update` 重建子节点时，缓存资源（geometry/material）不要 dispose——它们可能被其他实例共享
