/**
 * @file 认证降级页面模块。
 */

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

type AuthDegradedPageProps = {
  onRetry?: () => void;
};

/**
 * 渲染认证服务降级页面。
 */
export function AuthDegradedPage({ onRetry }: AuthDegradedPageProps) {
  const { t } = useTranslation("common");

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="surface-liquid flex w-full max-w-lg flex-col gap-4 rounded-[1.5rem] p-8">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {t("authDegradedEyebrow")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t("authDegradedTitle")}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{t("authDegradedDescription")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={onRetry} type="button">
            {t("retryAction")}
          </Button>
          <Button asChild variant="outline">
            <Link to="/login">{t("backToLoginAction")}</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
