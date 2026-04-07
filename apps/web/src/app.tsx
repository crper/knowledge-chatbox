/**
 * @file 应用根组件装配模块。
 */

import { AppProviders } from "./providers/app-providers";
import { TanStackRouterProvider } from "./providers/tanstack-router-provider";

/**
 * 渲染应用根组件。
 */
export function AppShell() {
  return (
    <AppProviders>
      <TanStackRouterProvider />
    </AppProviders>
  );
}
