/**
 * @file 无权限页面模块。
 */

import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/app-router";
import { cn } from "@/lib/utils";

/**
 * 渲染无权限页面。
 */
export function ForbiddenPage() {
  const { t } = useTranslation("common");

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-10 text-foreground">
      <section className="surface-elevated flex w-full max-w-lg flex-col gap-4 rounded-2xl p-8 text-center">
        <p className="text-sm font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {t("forbiddenCode")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("forbiddenCode")}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{t("forbiddenDescription")}</p>
        <div className="flex justify-center">
          <Link className={cn(buttonVariants())} to="/chat">
            {t("forbiddenBackAction")}
          </Link>
        </div>
      </section>
    </main>
  );
}
