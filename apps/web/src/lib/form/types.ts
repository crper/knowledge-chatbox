import type { ReactFormExtendedApi } from "@tanstack/react-form";

/**
 * 接受任意表单数据的 FormApi 类型别名。
 *
 * TanStack Form 的 ReactFormExtendedApi 是不变泛型（invariant），
 * ReactFormExtendedApi<SpecificData, ...> 无法赋值给
 * ReactFormExtendedApi<Record<string, any>, ...>，
 * 因此必须用 any 兼容不同表单数据结构。
 *
 * 结构化类型方案（如 { Field: ComponentType<...> }）不可行：
 * form.Field 是泛型组件，TypeScript 不允许将泛型方法
 * 赋值给非泛型的 ComponentType 固定签名。
 */
export type AnyFormApi = ReactFormExtendedApi<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;
