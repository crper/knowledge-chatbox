/**
 * @file 设置页面模块。
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useParams } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WorkspacePage } from "@/components/shared/workspace-page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  changePasswordMutationOptions,
  updatePreferencesMutationOptions,
} from "@/features/auth/api/auth-query";
import { ChangePasswordDialog } from "@/features/auth/components/change-password-dialog";
import { LanguageToggle } from "@/features/settings/components/language-toggle";
import { ProviderForm } from "@/features/settings/components/provider-form";
import { SystemPromptForm } from "@/features/settings/components/system-prompt-form";
import { ThemeToggle } from "@/features/settings/components/theme-toggle";
import {
  settingsDetailQueryOptions,
  testProviderConnectionMutationOptions,
  updateSettingsMutationOptions,
} from "@/features/settings/api/settings-query";
import type { AppSettings } from "@/features/settings/api/settings";
import { getSettingsSections, resolveSettingsSection } from "@/features/settings/settings-sections";
import { getIndexStatusLabel } from "@/features/settings/utils/index-status";
import { formatProviderProfile, getProviderLabel } from "@/lib/provider-display";
import type { AppUser } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/client";
import { expireSession } from "@/lib/auth/session-manager";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * 渲染设置页面。
 */
export function SettingsPage({ user }: { user: AppUser }) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const { section: sectionParam } = useParams({ strict: false }) as { section?: string };
  const isAdmin = user.role === "admin";
  const isMobile = useIsMobile();
  const activeSection = resolveSettingsSection(sectionParam ?? null, user);
  const sections = getSettingsSections(user);
  const sectionDefinition = sections.find((section) => section.id === activeSection)!;

  const settingsQuery = useQuery(
    settingsDetailQueryOptions(
      isAdmin && (activeSection === "providers" || activeSection === "prompt"),
    ),
  );
  const updateMutation = useMutation(updateSettingsMutationOptions(queryClient));
  const testMutation = useMutation(testProviderConnectionMutationOptions());
  const passwordMutation = useMutation(changePasswordMutationOptions());
  const preferenceMutation = useMutation(updatePreferencesMutationOptions(queryClient));

  const renderAsideCards = (settings?: AppSettings) => (
    <>
      <Card className="workspace-surface-subtle border-border/50" size="sm">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-sm font-semibold tracking-tight">
            {t("chatConnectionCardTitle")}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground/72 leading-relaxed">
            {t("chatConnectionCardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {settings ? (
            <>
              <Badge className="w-fit rounded-full px-2 py-0.5 text-[11px]" variant="secondary">
                {getProviderLabel(settings.response_route.provider, t)}
              </Badge>
              <p className="text-xs leading-relaxed text-muted-foreground/76">
                {formatProviderProfile(
                  settings.response_route.provider,
                  settings.response_route.model ?? null,
                  t,
                )}
              </p>
            </>
          ) : (
            <Skeleton className="h-5 w-20 rounded-full" />
          )}
        </CardContent>
      </Card>

      <Card className="workspace-surface-subtle border-border/50" size="sm">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-sm font-semibold tracking-tight">
            {t("retrievalCardTitle")}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground/72 leading-relaxed">
            {t("retrievalCardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs leading-relaxed text-muted-foreground/72">
          {settings ? (
            <>
              <p>
                {formatProviderProfile(
                  settings.embedding_route.provider,
                  settings.embedding_route.model ?? null,
                  t,
                )}
              </p>
              {settings.pending_embedding_route ? (
                <p>
                  {t("pendingRetrievalProfileLabel")}
                  {formatProviderProfile(
                    settings.pending_embedding_route.provider,
                    settings.pending_embedding_route.model ?? null,
                    t,
                  )}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-40" />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="workspace-surface-subtle border-border/50" size="sm">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-sm font-semibold tracking-tight">
            {t("indexStatusCardTitle")}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground/72 leading-relaxed">
            {t("indexStatusCardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 text-xs leading-relaxed text-muted-foreground/72">
          {settings ? (
            <>
              <Badge
                className="w-fit rounded-full px-2 py-0.5 text-[11px]"
                variant={settings.index_rebuild_status === "failed" ? "destructive" : "secondary"}
              >
                {getIndexStatusLabel(settings.index_rebuild_status, t)}
              </Badge>
              <p>
                {t("indexActiveGenerationLabel", {
                  generation: settings.active_index_generation ?? 1,
                })}
              </p>
              {settings.building_index_generation ? (
                <p>
                  {t("indexBuildingGenerationLabel", {
                    generation: settings.building_index_generation,
                  })}
                </p>
              ) : null}
              <p>
                {settings.index_rebuild_status === "running"
                  ? t("indexStatusRunningHint")
                  : settings.index_rebuild_status === "failed"
                    ? t("indexStatusFailedHint")
                    : t("indexStatusIdleHint")}
              </p>
            </>
          ) : (
            <>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-40" />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );

  const renderSectionNavigation = () =>
    isMobile ? (
      <nav aria-label={t("navigationLabel")} className="flex w-full gap-2 overflow-x-auto pb-1">
        {sections.map((section) => {
          const isActive = section.id === activeSection;

          return (
            <Link
              key={section.id}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                buttonVariants({ size: "sm", variant: isActive ? "secondary" : "outline" }),
                "shrink-0",
              )}
              to="/settings/$section"
              params={{ section: section.id }}
            >
              {t(section.titleKey)}
            </Link>
          );
        })}
      </nav>
    ) : null;

  const renderSelfServiceCards = () => (
    <Card className="workspace-surface border-border/50">
      <CardHeader className="gap-1.5 border-b border-border/60 pb-4">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {t("preferencesCardTitle")}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground/76 leading-relaxed">
          {t("preferencesCardDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3.5 pt-4">
        <section className="surface-inline rounded-xl p-3.5">
          <div className="mb-2.5 space-y-1">
            <p className="text-[13px] font-medium">{t("languageSettingTitle")}</p>
            <p className="text-xs leading-relaxed text-muted-foreground/68">
              {t("languageSettingDescription")}
            </p>
          </div>
          <LanguageToggle />
        </section>

        <section className="surface-inline rounded-xl p-3.5">
          <div className="mb-2.5 space-y-1">
            <p className="text-[13px] font-medium">{t("themeSettingTitle")}</p>
            <p className="text-xs leading-relaxed text-muted-foreground/68">
              {t("themeSettingDescription")}
            </p>
          </div>
          <ThemeToggle
            onChange={(nextTheme) => preferenceMutation.mutate({ themePreference: nextTheme })}
          />
        </section>
      </CardContent>
    </Card>
  );

  const renderSecurityCard = () => (
    <Card className="workspace-surface border-border/50">
      <CardHeader className="gap-1.5 border-b border-border/60 pb-4">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {t("securityCardTitle")}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground/76 leading-relaxed">
          {t("securityCardDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <Button
          className="h-9 w-full sm:w-auto"
          onClick={() => setPasswordDialogOpen(true)}
          type="button"
          variant="outline"
        >
          {tCommon("changePasswordAction")}
        </Button>
      </CardContent>
    </Card>
  );

  const renderManagementCard = () => (
    <Card className="workspace-surface border-border/50">
      <CardHeader className="gap-1.5 border-b border-border/60 pb-4">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {t("managementCardTitle")}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground/76 leading-relaxed">
          {t("managementCardDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <Link className={cn(buttonVariants(), "h-9 w-full sm:w-auto")} to="/admin/users">
          {t("managementEntryAction")}
        </Link>
      </CardContent>
    </Card>
  );

  const renderDialog = () => (
    <ChangePasswordDialog
      open={passwordDialogOpen}
      onClose={() => setPasswordDialogOpen(false)}
      onSubmit={async (input) => {
        await passwordMutation.mutateAsync(input);
        await expireSession(queryClient);
        toast.success(t("changePasswordSuccessToast", { ns: "auth" }));
      }}
    />
  );

  const backgroundRefreshError =
    settingsQuery.isError && settingsQuery.data ? getApiErrorMessage(settingsQuery.error) : null;

  if (!isAdmin || (activeSection !== "providers" && activeSection !== "prompt")) {
    const sectionMain =
      activeSection === "security"
        ? renderSecurityCard()
        : activeSection === "management"
          ? renderManagementCard()
          : renderSelfServiceCards();

    return (
      <WorkspacePage
        actions={renderSectionNavigation()}
        badge={t("configBadge")}
        description={t(sectionDefinition.descriptionKey)}
        main={
          <div className="space-y-4">
            {sectionMain}
            {renderDialog()}
          </div>
        }
        title={t(sectionDefinition.titleKey)}
      />
    );
  }

  if (settingsQuery.isPending) {
    return (
      <WorkspacePage
        actions={renderSectionNavigation()}
        aside={renderAsideCards()}
        badge={t("configBadge")}
        description={t(sectionDefinition.descriptionKey)}
        main={
          <Card className="workspace-surface border-border/70">
            <CardContent className="pt-0">
              <div className="space-y-5">
                <Skeleton className="h-10 w-48 rounded-full" />
                <Skeleton className="h-72 w-full rounded-2xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
              </div>
            </CardContent>
          </Card>
        }
        title={t(sectionDefinition.titleKey)}
      />
    );
  }

  if (settingsQuery.isError && !settingsQuery.data) {
    return (
      <WorkspacePage
        actions={renderSectionNavigation()}
        aside={renderAsideCards()}
        badge={t("configBadge")}
        description={t(sectionDefinition.descriptionKey)}
        main={
          <Card className="workspace-surface border-border/70">
            <CardContent className="pt-0">
              <p className="text-ui-subtle text-destructive">
                {getApiErrorMessage(settingsQuery.error)}
              </p>
            </CardContent>
          </Card>
        }
        title={t(sectionDefinition.titleKey)}
      />
    );
  }

  if (!settingsQuery.data) {
    return (
      <WorkspacePage
        actions={renderSectionNavigation()}
        aside={renderAsideCards()}
        badge={t("configBadge")}
        description={t(sectionDefinition.descriptionKey)}
        main={
          <Card className="workspace-surface border-border/70">
            <CardContent className="pt-0">
              <p className="text-ui-subtle text-muted-foreground">{t("loading")}</p>
            </CardContent>
          </Card>
        }
        title={t(sectionDefinition.titleKey)}
      />
    );
  }

  const displayedSettings = settingsQuery.data;
  const systemAside =
    activeSection === "providers" ? renderAsideCards(displayedSettings) : undefined;
  const systemMain =
    activeSection === "providers" ? (
      <ProviderForm
        initialValues={displayedSettings}
        savePending={updateMutation.isPending}
        testPending={testMutation.isPending}
        onSave={(values) => updateMutation.mutateAsync(values)}
        onTestProvider={(values) => testMutation.mutateAsync(values)}
      />
    ) : (
      <SystemPromptForm
        initialValues={displayedSettings}
        savePending={updateMutation.isPending}
        onSave={(values) => updateMutation.mutateAsync(values)}
      />
    );

  return (
    <WorkspacePage
      actions={renderSectionNavigation()}
      aside={systemAside}
      badge={t("configBadge")}
      description={t(sectionDefinition.descriptionKey)}
      main={
        <div className="space-y-4">
          {backgroundRefreshError ? (
            <Alert
              className="rounded-xl border-destructive/30 bg-destructive/5 px-4 py-3"
              variant="destructive"
            >
              <AlertDescription>{backgroundRefreshError}</AlertDescription>
            </Alert>
          ) : null}
          <Card className="workspace-surface border-border/70">
            <CardContent className="pt-0">{systemMain}</CardContent>
          </Card>
          {renderDialog()}
        </div>
      }
      title={t(sectionDefinition.titleKey)}
    />
  );
}
