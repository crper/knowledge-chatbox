/**
 * @file 共享加载状态组件。
 */

import { useTranslation } from "react-i18next";

/**
 * 渲染加载状态。
 */
export function LoadingState() {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="relative flex items-center justify-center">
        <div className="absolute size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <div className="size-8" />
      </div>
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    </div>
  );
}
