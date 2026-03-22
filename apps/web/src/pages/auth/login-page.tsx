/**
 * @file 登录页面模块。
 */

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BracesIcon,
  CircleHelpIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { queryKeys } from "@/lib/api/query-keys";
import { getApiErrorMessage } from "@/lib/api/client";
import { login, updatePreferences } from "@/features/auth/api/auth";
import { LoginForm } from "@/features/auth/components/login-form";
import { markSessionAuthenticated } from "@/lib/auth/session-manager";
import { useSessionStore } from "@/lib/auth/session-store";
import { BrandMark } from "@/components/shared/brand-mark";
import { LanguageToggle } from "@/features/settings/components/language-toggle";
import { ThemeToggle } from "@/features/settings/components/theme-toggle";
import { THEME_SYNC_ON_LOGIN_STORAGE_KEY, type ThemeMode } from "@/lib/config/constants";

function readPendingThemeSync(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

/**
 * 渲染登录页面。
 */
export function LoginPage() {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearRedirectTo = useSessionStore((state) => state.clearRedirectTo);
  const redirectTo = useSessionStore((state) => state.redirectTo);
  const [loginError, setLoginError] = useState<unknown>(null);
  const workbenchSteps: Array<{
    icon: LucideIcon;
    title: string;
    description: string;
  }> = [
    {
      icon: PaperclipIcon,
      title: t("brandFeatureResources"),
      description: t("brandFeatureResourcesDescription"),
    },
    {
      icon: MessagesSquareIcon,
      title: t("brandFeatureConversation"),
      description: t("brandFeatureConversationDescription"),
    },
    {
      icon: BracesIcon,
      title: t("brandFeatureReview"),
      description: t("brandFeatureReviewDescription"),
    },
  ];
  const aboutSections = [
    {
      title: t("aboutAudienceTitle"),
      description: t("aboutAudienceDescription"),
    },
    {
      title: t("aboutWorkflowTitle"),
      description: t("aboutWorkflowDescription"),
    },
    {
      title: t("aboutBoundaryTitle"),
      description: t("aboutBoundaryDescription"),
    },
  ];

  const handleSubmit = async (input: { username: string; password: string }) => {
    setLoginError(null);
    try {
      const authenticatedUser = await login(input);
      const pendingTheme = readPendingThemeSync();
      const nextUser =
        pendingTheme === null || authenticatedUser.user.theme_preference === pendingTheme
          ? authenticatedUser.user
          : await updatePreferences({ themePreference: pendingTheme });
      if (pendingTheme === null || nextUser.theme_preference === pendingTheme) {
        window.sessionStorage.removeItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY);
      }
      queryClient.setQueryData(queryKeys.auth.me, nextUser);
      markSessionAuthenticated();
      const nextPath = redirectTo ?? "/chat";
      clearRedirectTo();
      void navigate(nextPath, { replace: true });
    } catch (error) {
      setLoginError(error);
    }
  };

  const errorMessage = loginError ? getApiErrorMessage(loginError) || t("loginFailed") : null;

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-background px-5 py-6 text-foreground md:px-6 md:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.1),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(var(--chart-2)/0.08),transparent_24%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--sidebar)/0.78)_100%)]" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-3rem)] max-w-7xl flex-col gap-6">
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <LanguageToggle compact />
          <ThemeToggle
            compact
            onChange={(nextTheme) => {
              window.sessionStorage.setItem(THEME_SYNC_ON_LOGIN_STORAGE_KEY, nextTheme);
            }}
          />
        </div>

        <div className="grid gap-6 lg:flex-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(340px,420px)] lg:items-stretch">
          <section aria-label={t("entryIntroRegionLabel")} className="relative order-2 lg:order-1">
            <div className="relative flex max-w-[52rem] flex-col gap-5 px-2 py-2 md:gap-6 md:px-4 md:py-4">
              <div className="space-y-6 md:space-y-7">
                <div className="flex items-start justify-between gap-4">
                  <BrandMark
                    alt={t("workspaceLogoAlt", { ns: "common" })}
                    className="max-w-sm"
                    subtitle={t("workspaceSubtitle", { ns: "common" })}
                    title={t("workspaceTitle", { ns: "common" })}
                  />
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        aria-label={t("aboutWorkspaceAction")}
                        className="rounded-full border-border/70 bg-background/62 text-muted-foreground shadow-none hover:bg-background/78 hover:text-foreground"
                        size="icon-sm"
                        variant="outline"
                      >
                        <CircleHelpIcon aria-hidden="true" className="size-4" />
                        <span className="sr-only">{t("aboutWorkspaceAction")}</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      className="max-w-lg gap-0 rounded-[1.5rem] p-0 sm:max-w-lg"
                      closeLabel={t("closeAction", { ns: "common" })}
                    >
                      <div className="border-b border-border/70 bg-sidebar/64 px-6 py-5">
                        <span className="surface-outline inline-flex rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
                          {t("aboutHighlights")}
                        </span>
                        <DialogHeader className="mt-4">
                          <DialogTitle className="text-2xl leading-tight font-semibold tracking-tight">
                            {t("aboutTitle")}
                          </DialogTitle>
                          <DialogDescription className="max-w-xl leading-6">
                            {t("aboutDescription")}
                          </DialogDescription>
                        </DialogHeader>
                      </div>

                      <div className="grid gap-3 px-6 py-6">
                        {aboutSections.map((section) => (
                          <div key={section.title} className="surface-outline rounded-2xl p-4">
                            <p className="text-sm font-medium">{section.title}</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {section.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="space-y-4">
                  <CardDescription className="text-[0.69rem] tracking-[0.14em] uppercase">
                    {t("brandEyebrow")}
                  </CardDescription>
                  <h1 className="max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-balance md:text-[3.2rem]">
                    {t("brandHeadline")}
                  </h1>
                  <p className="max-w-[62ch] text-base leading-7 text-muted-foreground md:text-[1.02rem]">
                    {t("brandDescription")}
                  </p>
                </div>
              </div>

              <div className="space-y-4 border-t border-border/60 pt-6">
                <div className="space-y-1">
                  <p className="text-[0.68rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    {t("entryChecklistTitle")}
                  </p>
                  <p className="max-w-[58ch] text-sm leading-6 text-muted-foreground">
                    {t("entryChecklistDescription")}
                  </p>
                </div>

                <ol aria-label={t("entryChecklistTitle")} className="space-y-1">
                  {workbenchSteps.map(({ icon: Icon, title, description }, index) => (
                    <li
                      key={title}
                      className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 py-3.5 not-last:border-b not-last:border-border/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="surface-icon flex size-10 items-center justify-center rounded-2xl text-primary">
                          <Icon aria-hidden="true" className="size-4" />
                        </span>
                        <span className="text-[0.68rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                          {`0${index + 1}`}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">{title}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section
            aria-label={t("loginRegionLabel")}
            className="order-1 flex justify-center lg:order-2 lg:items-center lg:justify-end"
          >
            <Card className="surface-liquid w-full max-w-md rounded-[1.95rem] py-6">
              <CardHeader className="gap-4 border-b border-border/70 pb-6">
                <div className="space-y-4 pl-4">
                  <Badge className="w-fit rounded-full px-3 py-1" variant="outline">
                    {t("loginHint")}
                  </Badge>
                  <div className="space-y-2">
                    <h2 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
                      {t("loginTitle")}
                    </h2>
                    <CardDescription>{t("controlledAccessDescription")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                <LoginForm
                  errorMessage={errorMessage}
                  onFieldChange={() => {
                    if (loginError) {
                      setLoginError(null);
                    }
                  }}
                  onSubmit={handleSubmit}
                />
                <p className="border-t border-border/60 pl-4 pt-4 text-sm leading-6 text-muted-foreground">
                  {t("workspaceConsistencyDescription")}
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
