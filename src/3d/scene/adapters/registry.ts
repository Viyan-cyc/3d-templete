/**
 * adapters/registry — 类型映射表（领域可配置）
 *
 * typeKey（实体字段名）→ TypeMapping，决定该实体渲染成 group/library 组件/模型。
 * 开发者注册 typeKey 覆盖默认；未注册的回落 skip（不产出，透明递归子，不漏孙辈实体）。
 * 新产品领域只需 register 一张表，遍历器不改。
 */
import type { TypeMapping, TypeRegistry } from './types';

const registry: TypeRegistry = {};

/**
 * 注册类型映射（合并到表）。
 * @param override true（默认）= 同名 key 覆盖；false = 仅填未注册的 key（默认映射兜底用）
 */
export const registerTypeMappings = (map: TypeRegistry, override = true): void => {
  for (const [key, mapping] of Object.entries(map)) {
    if (override || registry[key] === undefined) {
      registry[key] = mapping;
    }
  }
};

/** 查询 typeKey 的映射；未注册回落 skip（不产出，透明递归子，不漏孙辈实体） */
export const resolveTypeMapping = (key: string): TypeMapping => registry[key] ?? { kind: 'skip' };

/** 清空映射表（测试用） */
export const clearTypeMappings = (): void => {
  for (const key of Object.keys(registry)) {
    delete registry[key];
  }
};
