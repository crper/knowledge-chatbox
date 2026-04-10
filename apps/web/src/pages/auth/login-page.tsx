/**
 * @file 登录页面模块。
 */

import { useQueryClient } from "@tanstack/react-query";
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
import { useLocation, useNavigate } from "@/lib/app-router";
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
import { resolvePostLoginPath } from "@/lib/auth/auth-redirect";
import { applyAuthenticatedAccessToken, setAuthenticatedSession } from "@/lib/auth/session-manager";
import { BrandMark } from "@/components/shared/brand-mark";
import { LanguageToggle } from "@/features/settings/components/language-toggle";
import { ThemeToggle } from "@/features/settings/components/theme-toggle";
import {
  clearPendingThemeSync,
  resolvePendingThemeSync,
  writePendingThemeSync,
} from "@/lib/config/theme-sync-storage";

/**
 * 渲染登录页面。
 */
export function LoginPage() {
  const { t } = useTranslation(["auth", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      applyAuthenticatedAccessToken(authenticatedUser.accessToken);
      const pendingThemeSync = resolvePendingThemeSync(authenticatedUser.user.theme_preference);
      const nextUser = pendingThemeSync.shouldClearPendingTheme
        ? authenticatedUser.user
        : {
            ...authenticatedUser.user,
            theme_preference: pendingThemeSync.resolvedTheme,
          };

      if (pendingThemeSync.shouldClearPendingTheme) {
        clearPendingThemeSync();
      } else {
        void updatePreferences({ themePreference: pendingThemeSync.resolvedTheme })
          .then((updatedUser) => {
            queryClient.setQueryData(queryKeys.auth.me, updatedUser);
            if (updatedUser.theme_preference === pendingThemeSync.pendingTheme) {
              clearPendingThemeSync();
            }
          })
          .catch(() => {
            // Keep the pending theme marker so the next session can retry syncing.
          });
      }
      await setAuthenticatedSession(queryClient, nextUser);
      const nextPath = resolvePostLoginPath(location.search);
      void navigate(nextPath, { replace: true });
    } catch (error) {
      setLoginError(error);
    }
  };

  const errorMessage = loginError ? getApiErrorMessage(loginError) || t("loginFailed") : null;

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-background px-5 py-6 text-foreground md:px-6 md:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_68%_46%_at_top_left,hsl(var(--primary)/0.055),transparent_50%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--sidebar)/0.78)_100%)]" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-3rem)] max-w-7xl flex-col gap-6">
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <LanguageToggle compact />
          <ThemeToggle
            compact
            onChange={(nextTheme) => {
              writePendingThemeSync(nextTheme);
            }}
          />
        </div>

        <div className="grid gap-6 lg:flex-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(340px,420px)] lg:items-stretch">
          <section aria-label={t("entryIntroRegionLabel")} className="relative order-2 lg:order-1">
            <div className="relative flex max-w-[52rem] flex-col gap-5 px-2 py-2 md:gap-6 md:px-4 md:py-4">
              <div className="space-y-5 md:space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <BrandMark
                    alt={t("workspaceLogoAlt", { ns: "common" })}
                    className="max-w-sm"
                    subtitle={t("workspaceSubtitle", { ns: "common" })}
                    title={t("workspaceTitle", { ns: "common" })}
                  />
                  <Dialog>
                    <DialogTrigger
                      render={
                        <Button
                          aria-label={t("aboutWorkspaceAction")}
                          className="rounded-full border-border/56 bg-background/56 text-muted-foreground/72 shadow-none hover:bg-background/72 hover:text-foreground"
                          size="icon-sm"
                          variant="outline"
                        />
                      }
                    >
                      <CircleHelpIcon aria-hidden="true" className="size-3.5" />
                      <span className="sr-only">{t("aboutWorkspaceAction")}</span>
                    </DialogTrigger>
                    <DialogContent
                      className="max-w-lg gap-0 rounded-2xl p-0 sm:max-w-lg"
                      closeLabel={t("closeAction", { ns: "common" })}
                    >
                      <div className="border-b border-border/60 bg-sidebar/58 px-6 py-5">
                        <span className="surface-inline inline-flex rounded-full px-2.5 py-0.5 text-ui-kicker text-muted-foreground/72">
                          {t("aboutHighlights")}
                        </span>
                        <DialogHeader className="mt-3.5">
                          <DialogTitle className="text-ui-heading tracking-tight">
                            {t("aboutTitle")}
                          </DialogTitle>
                          <DialogDescription className="max-w-xl text-ui-body text-muted-foreground/82">
                            {t("aboutDescription")}
                          </DialogDescription>
                        </DialogHeader>
                      </div>

                      <div className="grid gap-2.5 px-6 py-5">
                        {aboutSections.map((section) => (
                          <div key={section.title} className="surface-inline rounded-xl p-3.5">
                            <p className="text-ui-title text-sm font-medium">{section.title}</p>
                            <p className="mt-1.5 text-ui-subtle text-muted-foreground/72 leading-relaxed">
                              {section.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="space-y-3.5">
                  <CardDescription className="text-ui-kicker text-muted-foreground/64">
                    {t("brandEyebrow")}
                  </CardDescription>
                  <h1 className="max-w-2xl text-ui-display text-balance tracking-tight">
                    {t("brandHeadline")}
                  </h1>
                  <p className="max-w-[62ch] text-ui-body text-muted-foreground/82 leading-relaxed">
                    {t("brandDescription")}
                  </p>
                </div>
              </div>

              <div className="space-y-3.5 border-t border-border/48 pt-5">
                <div className="space-y-1">
                  <p className="text-ui-kicker text-muted-foreground/64">
                    {t("entryChecklistTitle")}
                  </p>
                  <p className="max-w-[58ch] text-ui-subtle text-muted-foreground/64 leading-relaxed">
                    {t("entryChecklistDescription")}
                  </p>
                </div>

                <ol aria-label={t("entryChecklistTitle")} className="space-y-0">
                  {workbenchSteps.map(({ icon: Icon, title, description }, index) => (
                    <li
                      key={title}
                      className="grid grid-cols-[auto_minmax(0,1fr)] gap-3.5 py-3.5 not-last:border-b not-last:border-border/28"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="surface-inline flex size-9 items-center justify-center rounded-xl text-primary/72">
                          <Icon aria-hidden="true" className="size-3.5" />
                        </span>
                        <span className="text-ui-kicker text-muted-foreground/56">
                          {`0${index + 1}`}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-ui-title text-sm font-medium">{title}</p>
                        <p className="text-ui-subtle text-muted-foreground/64 leading-relaxed">
                          {description}
                        </p>
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
            <Card className="surface-elevated w-full max-w-md rounded-2xl py-5">
              <CardHeader className="gap-3.5 border-b border-border/60 pb-5">
                <div className="space-y-3 pl-4">
                  <Badge className="w-fit rounded-full px-2.5 py-0.5 text-xs" variant="outline">
                    {t("loginHint")}
                  </Badge>
                  <div className="space-y-1.5">
                    <h2 className="text-ui-heading tracking-tight">{t("loginTitle")}</h2>
                    <CardDescription className="text-sm text-muted-foreground/76">
                      {t("controlledAccessDescription")}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <LoginForm
                  errorMessage={errorMessage}
                  onFieldChange={() => {
                    if (loginError) {
                      setLoginError(null);
                    }
                  }}
                  onSubmit={handleSubmit}
                />
                <p className="border-t border-border/48 pl-4 pt-3 text-ui-subtle text-muted-foreground/60 leading-relaxed">
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
