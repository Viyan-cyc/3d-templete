# 多框架多语言分支同步方案

> 本文档面向 **团队所有开发者**——在 main 分支完成开发后，如何将改动同步到 vue_js / react_ts / react_js 分支。

---

## 🚀 快速上手：同步 main 的更新

> 如果你只是想**把 main 最新改动同步到自己负责的分支**，按下面操作即可，不用读完整文档。

### 同步状态记录（docs/SYNC_STATUS.md）

在 main 分支上维护一个 `docs/SYNC_STATUS.md` 文件，记录所有分支的同步进度，一眼看到全局：

```
| 分支      | 已同步到 main commit | commit 信息        | 同步人 | 同步日期   |
|-----------|---------------------|--------------------|--------|-----------|
| vue_js    | a1b2c3d             | feat: 优化场景加载  | Tony   | 2026-07-27|
| react_ts  | a1b2c3d             | feat: 优化场景加载  | Tony   | 2026-07-27|
| react_js  | b2c3d4e             | feat: 新增 AGV 卡片 | Alex   | 2026-07-25|
```

**用法**：
- 想知道各分支同步到哪了 → 在 main 上 `cat docs/SYNC_STATUS.md`
- 想知道某分支还有哪些新改动没同步 → `git log <表中的commit>..main --oneline`
- **每次同步完任何分支后，回到 main 更新此文件并 commit**

### 同步到 vue_js

```bash
git checkout vue_js

# 查看当前同步到哪了 + main 有哪些新改动
git checkout main
cat docs/SYNC_STATUS.md                                    # 看全局状态
git log <vue_js的commit>..main --oneline                   # 看未同步的改动

# 开始同步
git checkout vue_js
git cherry-pick <commit-hash>   # 或多个: git cherry-pick hash1 hash2 hash3
npm run sync:ts-to-js           # 自动把 .ts → .js，去掉 lang="ts"

npm run dev    # 验证

# ✅ 回到 main 更新同步状态
git checkout main
# 编辑 docs/SYNC_STATUS.md，更新 vue_js 那一行
git add docs/SYNC_STATUS.md
git commit -m "sync: update vue_js status"
```

如果 cherry-pick 有 .ts→.js 文件名冲突：
```bash
git checkout --theirs <冲突文件>
git add <冲突文件>
git cherry-pick --continue
npm run sync:ts-to-js
```

### 同步到 react_ts

```bash
# 查看当前同步到哪了 + main 有哪些新改动
git checkout main
cat docs/SYNC_STATUS.md                                    # 看全局状态
git log <react_ts的commit>..main --oneline                 # 看未同步的改动

# 开始同步
git checkout react_ts
git cherry-pick <commit-hash>

# 处理 UI 层冲突（如果有）
git status

# .vue 文件冲突 → 删掉（react_ts 上是 .tsx，不需要 .vue）
git rm src/views/Scene3D.vue              # 举例，按实际冲突文件来
git rm src/components/cards/InfoCard.vue  # 举例
git rm -r src/adapters/vue/               # 如果有这个目录的冲突

# sceneCardRules.ts 冲突 → 手动改 import 路径
#   把 @/adapters/vue/... 改成 @/adapters/react/...
#   把 InfoCard.vue 改成 InfoCard.tsx

git add .
git cherry-pick --continue

# 在对应 .tsx 文件里做等价改动（参考下方翻译映射表）
# ...

npm run dev    # 验证

# ✅ 回到 main 更新同步状态
git checkout main
# 编辑 docs/SYNC_STATUS.md，更新 react_ts 那一行
git add docs/SYNC_STATUS.md
git commit -m "sync: update react_ts status"
```

### 同步到 react_js（⚠️ 必须从 react_ts 中转，不能从 main 直接同步）

```bash
# 先确保 react_ts 已同步并 commit
git checkout react_js
git cherry-pick <react_ts的commit-hash>
npm run sync:ts-to-js

npm run dev    # 验证

# ✅ 回到 main 更新同步状态
git checkout main
# 编辑 docs/SYNC_STATUS.md，更新 react_js 那一行
git add docs/SYNC_STATUS.md
git commit -m "sync: update react_js status"
```

### 一次同步全部分支（完整流程）

```bash
# 1. 在 main 上确认要同步的 commit
git checkout main
git pull
COMMIT=$(git rev-parse HEAD)

# 2. 同步 vue_js
git checkout vue_js
git cherry-pick $COMMIT
npm run sync:ts-to-js
npm run dev    # 验证通过后继续

# 3. 同步 react_ts
git checkout react_ts
git cherry-pick $COMMIT
# 处理 UI 冲突（见上方），手动翻译 .tsx
npm run dev    # 验证通过后继续

# 4. 同步 react_js（从 react_ts 中转）
git checkout react_js
git cherry-pick <react_ts刚提交的hash>
npm run sync:ts-to-js
npm run dev    # 验证通过后继续

# 5. 回到 main 更新全局同步状态
git checkout main
# 编辑 docs/SYNC_STATUS.md，更新三个分支的 commit 和日期
git add docs/SYNC_STATUS.md
git commit -m "sync: update all branch status to $COMMIT"
```

### 需要手动翻译的场景

| main 改了什么 | vue_js 要做什么 | react_ts 要做什么 |
|--------------|----------------|------------------|
| `src/3d/**` | 不用管，脚本自动转 | 不用管，自动合入 |
| `src/adapters/shared/**` | 不用管，脚本自动转 | 不用管，自动合入 |
| `.vue` 模板改了 | 不用管，脚本去 lang="ts" | **手动翻译成 .tsx** |
| `sceneCardRules.ts` 改了 | 脚本自动转 | 手动改 import 路径 |
| 新增了 .vue 文件 | cherry-pick + 脚本 | **新建对应 .tsx 并翻译** |

### Vue → React 速查（最常用的 5 个）

| Vue 写法 | React 写法 |
|---------|-----------|
| `ref(x)` | `useState(x)` |
| `onMounted(fn)` | `useEffect(fn, [])` |
| `v-if="x"` | `{x && ...}` |
| `@click="fn"` | `onClick={fn}` |
| `:class="x"` | `className={x}` |

完整映射见[第 8 节](#8-vuereact-翻译映射表)。

---

## 目录

1. [分支概览](#1-分支概览)
2. [目录分层原则](#2-目录分层原则)
3. [同步链路（严格遵守）](#3-同步链路严格遵守)
4. [同步前：判断改动类型](#4-同步前判断改动类型)
5. [同步到 vue_js](#5-同步到-vue_js)
6. [同步到 react_ts](#6-同步到-react_ts)
7. [同步到 react_js](#7-同步到-react_js)
8. [Vue→React 翻译映射表](#8-vuereact-翻译映射表)
9. [TS→JS 自动转换脚本](#9-tsjs-自动转换脚本)
10. [常见场景示例](#10-常见场景示例)
11. [注意事项与常见问题](#11-注意事项与常见问题)

---

## 1. 分支概览

| 分支 | 框架 | 语言 | 角色 |
|------|------|------|------|
| `main` | Vue | TypeScript | **主开发分支**，所有改动先在这里做 |
| `vue_js` | Vue | JavaScript | 产品 JS 版本，纯 JS 无 TS 依赖 |
| `react_ts` | React | TypeScript | React 版本 |
| `react_js` | React | JavaScript | React + JS 版本 |

**核心规则**：所有改动先在 main 完成，再同步到其他分支。不要在其他分支上独立开发。

---

## 2. 目录分层原则

```
src/
  3d/                          ← 框架无关层（零 Vue/React import）
                                 ✅ cherry-pick 零冲突到所有分支

  adapters/
    shared/                    ← 框架无关逻辑层
                                 ✅ cherry-pick 零冲突到所有分支
      scene3dLogic.ts            页面控制器（状态 + 生命周期逻辑）
      embedLogic.ts              embed 控制器
      cardHostLogic.ts           CardHost 逻辑

    vue/                        ← Vue 适配层（main / vue_js 分支）
      cards/CardHost.vue
      index.ts

    react/                      ← React 适配层（react_ts / react_js 分支）
      cards/CardHost.tsx
      index.ts

  views/                       ← 框架模板层（需手动翻译 Vue↔React）
    Scene3D.vue / .tsx
    embed.vue / .tsx

  components/cards/            ← 框架模板层（需手动翻译 Vue↔React）
    InfoCard.vue / .tsx

  cards/
    sceneCardRules.ts          ← import 路径指向 adapters/（各分支不同）

  router/                      ← 框架特定
  network/                     ← 框架无关
  styles/                      ← 框架无关
```

**关键约束**：

- `src/3d/` 和 `src/adapters/shared/` 绝不能 import Vue 或 React
- CardRegistry 使用泛型 `CardComponentRegistry<T = unknown>`，不引入任何框架
- CardHost 放在 `adapters/vue/` 或 `adapters/react/`，不在 `src/3d/` 里
- `src/3d/index.ts` 不再 export CardHost

---

## 3. 同步链路（严格遵守）

```
main ──cherry-pick──→ vue_js
  │
  ├──cherry-pick──→ react_ts ──cherry-pick──→ react_js
  │                   ↑ Vue→React翻译        ↑ ts-to-js脚本
  │
  ❌ 不能从 main 直接 cherry-pick 到 react_js！
     因为 .vue/.ts 文件在 react_js 上已变成 .jsx/.js，
     git 无法关联，到处冲突。
```

**允许的同步路径**：

| 路径 | 方式 |
|------|------|
| `main → vue_js` | cherry-pick + ts-to-js 脚本 |
| `main → react_ts` | cherry-pick + 手动翻译 UI 层 |
| `react_ts → react_js` | cherry-pick + ts-to-js 脚本 |

**禁止的路径**：

| 路径 | 原因 |
|------|------|
| `main → react_js` | .vue/.ts → .jsx/.js 文件名不同，git 无法关联，到处冲突 |
| 跨分支反向同步 | 改动只能在 main 做，不能从其他分支合回 main |

---

## 4. 同步前：判断改动类型

```bash
# 在 main 上查看最新 commit 改了哪些文件
git diff --name-only HEAD~1
```

| 改动路径 | 需要同步到 | 同步方式 |
|----------|-----------|----------|
| `src/3d/**` | 全部 | ✅ cherry-pick 直过 |
| `src/adapters/shared/**` | 全部 | ✅ cherry-pick 直过 |
| `src/adapters/vue/**` | vue_js | cherry-pick + 去 lang="ts" |
| `src/adapters/vue/**` | react_ts/react_js | 手动翻译对应 adapters/react/ 文件 |
| `src/views/*.vue` | vue_js | cherry-pick + 去 lang="ts" |
| `src/views/*.vue` | react_ts/react_js | 手动翻译对应 .tsx 文件 |
| `src/components/cards/*.vue` | vue_js | cherry-pick + 去 lang="ts" |
| `src/components/cards/*.vue` | react_ts/react_js | 手动翻译对应 .tsx 文件 |
| `src/cards/sceneCardRules.ts` | 全部 | cherry-pick + 改 import 路径 |
| `src/network/**` / `src/styles/**` | 全部 | ✅ cherry-pick 直过 |

---

## 5. 同步到 vue_js

### 步骤

```bash
# 1. 切到 vue_js
git checkout vue_js

# 2. cherry-pick main 的 commit
git cherry-pick <commit-hash>

# 3. 如果有 .ts→.js 文件名冲突：
#    先接受 main 的 .ts 内容（后面脚本会转）
git checkout --theirs <冲突的.ts文件>
git add <冲突的.ts文件>
git cherry-pick --continue

# 4. 跑自动转换脚本（.ts→.js + 去 lang="ts"）
npm run sync:ts-to-js

# 5. 验证
npm run dev
```

### 说明

- `src/3d/` 和 `src/adapters/shared/` 的改动：cherry-pick 无冲突，脚本自动转 .js
- `.vue` 文件：脚本自动去掉 `lang="ts"`
- 每次同步约 **1-2 分钟**

---

## 6. 同步到 react_ts

### 步骤

```bash
# 1. 切到 react_ts
git checkout react_ts

# 2. cherry-pick main 的 commit
git cherry-pick <commit-hash>
```

### cherry-pick 结果判断

| main 改了什么 | cherry-pick 结果 | 处理 |
|---------------|-----------------|------|
| `src/3d/**` | ✅ 无冲突自动合入 | 不用管 |
| `src/adapters/shared/**` | ✅ 无冲突自动合入 | 不用管 |
| `src/views/*.vue` | ❌ delete/modify 冲突 | 见下方处理 |
| `src/components/cards/*.vue` | ❌ delete/modify 冲突 | 见下方处理 |
| `src/adapters/vue/**` | ❌ 会带入 Vue 代码 | 见下方处理 |
| `src/cards/sceneCardRules.ts` | ❌ 内容冲突（import 路径不同） | 手动改 import 路径 |

### 冲突处理流程

```bash
# 查看哪些文件冲突
git status

# .vue 文件冲突：react_ts 上已变成 .tsx，丢弃 main 的 .vue
git checkout --ours src/views/Scene3D.vue
git rm src/views/Scene3D.vue

# adapters/vue/ 冲突：删除，不让 Vue 代码污染 react_ts
git rm -r src/adapters/vue/

# sceneCardRules.ts 冲突：手动改 import 路径
#   @/adapters/vue/... → @/adapters/react/...
#   InfoCard.vue → InfoCard.tsx

# 完成 cherry-pick
git add .
git cherry-pick --continue

# 然后手动在对应的 .tsx 文件里做等价改动
# 参考"Vue→React 翻译映射表"章节

# 验证
npm run dev
```

### 关键认知

- cherry-pick 只自动合入 `src/3d/` 和 `src/adapters/shared/` 的改动
- UI 层的冲突只是**提醒你 main 改了这里**，React 代码仍需手动翻译
- `.vue` → `.tsx` 在 git 看来是不同文件，永远会冲突，这是正常的

---

## 7. 同步到 react_js

### 步骤

```bash
# 1. 确保 react_ts 已同步（先完成第 6 节的流程）
# 2. 切到 react_js
git checkout react_js

# 3. cherry-pick react_ts 的 commit
git cherry-pick <react_ts刚提交的hash>

# 4. 如果有 .ts→.js 文件名冲突：
git checkout --theirs <冲突的.ts文件>
git add <冲突的.ts文件>
git cherry-pick --continue

# 5. 跑自动转换脚本
npm run sync:ts-to-js

# 6. 验证
npm run dev
```

### ⚠️ 禁止直接从 main 同步

```bash
# ❌ 错误做法
git checkout react_js
git cherry-pick <main的hash>    # 到处冲突，无法处理

# ✅ 正确做法：必须经 react_ts 中转
main → react_ts → react_js
```

---

## 8. Vue→React 翻译映射表

### API 对照

| Vue | React | 说明 |
|-----|-------|------|
| `ref(x)` | `useState(x)` | 响应式状态 |
| `computed(() => x)` | `useMemo(() => x, [deps])` | 派生状态 |
| `onMounted(fn)` | `useEffect(fn, [])` | 挂载 |
| `onUnmounted(fn)` | `useEffect(() => () => fn(), [])` | 卸载 |
| `watch(src, cb)` | `useEffect(cb, [src])` | 监听 |
| `defineProps<T>()` | `function Comp(props: T)` | props 声明 |
| `defineEmits<T>()` | `props.onX` | 事件声明 |

### 模板对照

| Vue | React | 说明 |
|-----|-------|------|
| `v-if="x"` | `{x && ...}` | 条件渲染 |
| `v-for="item in list" :key="item.id"` | `{list.map(item => ...)}` | 列表渲染 |
| `v-bind="props"` | `{...props}` | 展开属性 |
| `:class="x"` | `className={x}` | class 绑定 |
| `@click="fn"` | `onClick={fn}` | 事件绑定 |
| `@click.stop="fn"` | `onClick={(e) => { e.stopPropagation(); fn() }}` | 阻止冒泡 |
| `<Teleport :to="el">` | `createPortal(children, el)` | 传送门 |
| `<component :is="Comp" />` | `<Comp />` 或 `React.createElement(Comp)` | 动态组件 |
| `<Transition name="x">` | CSS transition 或 framer-motion | 过渡动画 |
| `ref="canvasRef"` | `ref={canvasRef}` | 模板引用 |

### 需要翻译的文件清单（5 个）

| main (Vue) | react_ts / react_js (React) |
|------------|---------------------------|
| `src/views/Scene3D.vue` | `src/views/Scene3D.tsx` |
| `src/views/embed.vue` | `src/views/embed.tsx` |
| `src/adapters/vue/cards/CardHost.vue` | `src/adapters/react/cards/CardHost.tsx` |
| `src/components/cards/InfoCard.vue` | `src/components/cards/InfoCard.tsx` |
| `src/cards/sceneCardRules.ts` | `src/cards/sceneCardRules.ts`（改 import 路径） |

---

## 9. TS→JS 自动转换脚本

### 脚本位置

`scripts/ts-to-js.mjs`

### 使用方式

```bash
npm run sync:ts-to-js
```

### 脚本做什么

1. 收集 `src/` 下所有 `.ts` / `.tsx` 文件（排除 `.d.ts` 和 `node_modules`）
2. 用 esbuild 批量 transpile：
   - 类型注解 → 删除
   - `interface` / `type` alias → 删除
   - `import type` → 删除整行
   - `enum` → 转 JS 对象
   - `namespace` → 展开
   - `as` 断言 → 删除
   - 输出 `.js` / `.jsx`
3. 删除原 `.ts` / `.tsx` 文件
4. 处理 `.vue` 文件：`<script setup lang="ts">` → `<script setup>`
5. 处理 `.vue` 文件：`<script lang="ts">` → `<script>`

### JS 分支额外清理

脚本跑完后，还需手动清理（仅首次建分支时）：

- 删除 `tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`、`env.d.ts`
- `package.json` 移除 `typescript`、`vue-tsc`、`@vue/tsconfig`
- `package.json` 的 build 脚本去掉 `vue-tsc -b`，只留 `vite build`

### 注意事项

- esbuild 不做类型检查，只 strip 语法，运行时行为不变
- cherry-pick 后先跑脚本再验证 `npm run dev`
- 脚本幂等：重复跑不会出错

---

## 10. 常见场景示例

### 场景 1：在 main 改了 3D 核心逻辑

```bash
# main 上 commit
git commit -m "feat: 优化场景加载性能"

# 同步到 vue_js
git checkout vue_js
git cherry-pick <hash>
npm run sync:ts-to-js

# 同步到 react_ts
git checkout react_ts
git cherry-pick <hash>    # 零冲突

# 同步到 react_js
git checkout react_js
git cherry-pick <react_ts的hash>
npm run sync:ts-to-js
```

**总耗时：约 3 分钟**

### 场景 2：在 main 改了 InfoCard 组件

```bash
# main 上 commit（改了 InfoCard.vue，加了新字段）
git commit -m "feat: InfoCard 增加 status 显示"

# 同步到 vue_js
git checkout vue_js
git cherry-pick <hash>
npm run sync:ts-to-js    # 自动去掉 lang="ts"

# 同步到 react_ts
git checkout react_ts
git cherry-pick <hash>
# InfoCard.vue 冲突 → 删掉
git rm src/components/cards/InfoCard.vue
git add .
git cherry-pick --continue
# 手动在 InfoCard.tsx 中做等价改动（参考翻译映射表）
# 约 5-10 分钟

# 同步到 react_js
git checkout react_js
git cherry-pick <react_ts的hash>
npm run sync:ts-to-js
```

**总耗时：约 10-15 分钟**

### 场景 3：在 main 同时改了 3D 核心和 UI

```bash
# main 上 commit
git commit -m "feat: 新增 AGV 卡片 + 组件管理优化"

# 同步到 vue_js
git checkout vue_js
git cherry-pick <hash>
npm run sync:ts-to-js

# 同步到 react_ts
git checkout react_ts
git cherry-pick <hash>
# src/3d/ → 零冲突
# UI 层 → 手动翻译
# 完成后 commit

# 同步到 react_js
git checkout react_js
git cherry-pick <react_ts的hash>
npm run sync:ts-to-js
```

**总耗时：约 10-20 分钟**

---

## 11. 注意事项与常见问题

### Q: 可以在 react_ts 上直接改代码吗？

**不推荐。** 所有改动应先在 main 做，再同步。如果确实需要在 react_ts 上紧急修复，事后必须在 main 上补做相同改动，否则下次 cherry-pick 会产生反向冲突。

### Q: cherry-pick 时 .vue → .tsx 的冲突怎么理解？

这是正常的。git 不理解 `Scene3D.vue` 和 `Scene3D.tsx` 是同一个文件，所以报 delete/modify 冲突。冲突本身是**有用的提示**——告诉你 main 改了这个 UI 文件，你需要在 .tsx 里做等价改动。

### Q: 忘了同步某个分支怎么办？

补上就行。cherry-pick 支持 commit range：

```bash
git checkout vue_js
git cherry-pick <第一个未同步的hash>..<最新的hash>
npm run sync:ts-to-js
```

### Q: ts-to-js 脚本会不会漏转某些 TS 语法？

esbuild 覆盖率极高，能正确处理所有标准 TS 语法。转完后跑一次 `npm run dev` 验证即可。极少数边界情况（如 `const enum`）可能需要手动处理。

### Q: 3D 核心代码能在 JS 分支里正常跑吗？

能。Vite 用 esbuild 编译 `.ts` 文件时只 strip 类型不检查，输出的 JS 和手写 `.js` 完全一样。但 JS 分支上这些文件已经被脚本转成了 `.js`，所以没有任何 TS 痕迹。

### Q: 多人协作时怎么避免同步遗漏？

建议在 main 上每完成一个功能就同步一次，不要攒很多 commit 再同步。可以在 main 的 commit message 里标注：

```
feat: 新增 AGV 卡片 [sync:vue_js,react_ts,react_js]
```

同步完成后划掉：

```
feat: 新增 AGV 卡片 [sync:vue_js✅,react_ts✅,react_js✅]
```
