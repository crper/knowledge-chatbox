/**
 * @file 路由 Provider 模块。
 */

import { BrowserRouter } from "react-router-dom";

import { AppRouter } from "../router";

/**
 * 挂载应用路由。
 */
export function RouterProvider() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
