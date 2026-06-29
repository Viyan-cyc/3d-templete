import type * as THREE from 'three'
import type { App3D } from '../App3D'

/**
 * ============================================================
 *  I3DComponent — 3D 组件接口
 *
 *  所有 3D 组件（无论来自 npm 包还是本项目）都实现此接口。
 *  组件通过 ComponentRegistry 注册后，即可在 JSON 数据中
 *  通过 type: 'component' + componentName 引用。
 * ============================================================
 */
export interface I3DComponent {
  /** 组件名（唯一标识，在 JSON 中通过 componentName 引用） */
  readonly name: string

  /**
   * 组件初始化
   * @param app   App3D 实例（可访问 renderer / scene / camera）
   * @param props 来自 JSON 中 ModelDef.props 的自定义属性
   * @returns 返回一个或多个 Object3D（会自动加入 scene）
   */
  setup(app: App3D, props: Record<string, unknown>): THREE.Object3D | THREE.Object3D[] | void

  /**
   * 每帧更新（可选）
   * @param delta   本帧间隔（秒）
   * @param elapsed 场景总运行时间（秒）
   */
  update?(delta: number, elapsed: number): void

  /**
   * 组件销毁时清理（可选）
   */
  dispose?(): void
}
