/**
 * @file 表单基础 UI 组件模块。
 */

import * as React from "react";
import { Form as FormPrimitive } from "@base-ui/react/form";

/**
 * 渲染 Base UI 表单容器。
 */
function Form(props: React.ComponentProps<typeof FormPrimitive>) {
  return <FormPrimitive data-slot="form" {...props} />;
}

export { Form };
