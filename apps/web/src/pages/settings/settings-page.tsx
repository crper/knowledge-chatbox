/**
 * @file 设置页面模块。
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useIsMobile } from "@/lib/hooks/use-mobile";

/**
 * 渲染设置页面。
 */
export function SettingsPage({ user }: { user: AppUser }) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [latestSettings, setLatestSettings] = useState<AppSettings | null>(null);
  const [searchParams] = useSearchParams();
  const isAdmin = user.role === "admin";
  const isMobile = useIsMobile();
  const activeSection = resolveSettingsSection(searchParams.get("section"), user);
  const sections = getSettingsSections(user);
  const sectionDefinition = sections.find((section) => section.id === activeSection)!;

  const settingsQuery = useQuery(
    settingsDetailQueryOptions(
      isAdmin && (activeSection === "providers" || activeSection === "prompt"),
    ),
  );
  const updateMutation = useMutation(updateSettingsMutationOptions(queryClient));
  const testMutation = useMutation(testProviderConnectionMutationOptions());
  const passwordMutation = useMutation(changePasswordMutationOptions(queryClient));
  const preferenceMutation = useMutation(updatePreferencesMutationOptions(queryClient));

  useEffect(() => {
    if (settingsQuery.data) {
      setLatestSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const renderAsideCards = (settings?: AppSettings) => (
    <>
      <Card className="workspace-surface-subtle border-border/70" size="sm">
        <CardHeader className="gap-1">
          <CardTitle>{t("chatConnectionCardTitle")}</CardTitle>
          <CardDescription className="text-ui-subtle">
            {t("chatConnectionCardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings ? (
            <>
              <Badge className="w-fit rounded-full px-3 py-1" variant="secondary">
                {getProviderLabel(settings.response_route.provider, t)}
              </Badge>
              <p className="text-ui-subtle text-muted-foreground">
                {formatProviderProfile(
                  settings.response_route.provider,
                  settings.response_route.model ?? null,
                  t,
                )}
              </p>
            </>
          ) : (
            <Skeleton className="h-6 w-24 rounded-full" />
          )}
        </CardContent>
      </Card>

      <Card className="workspace-surface-subtle border-border/70" size="sm">
        <CardHeader className="gap-1">
          <CardTitle>{t("retrievalCardTitle")}</CardTitle>
          <CardDescription className="text-ui-subtle">
            {t("retrievalCardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-ui-subtle text-muted-foreground">
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
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-44" />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="workspace-surface-subtle border-border/70" size="sm">
        <CardHeader className="gap-1">
          <CardTitle>{t("indexStatusCardTitle")}</CardTitle>
          <CardDescription className="text-ui-subtle">
            {t("indexStatusCardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-ui-subtle text-muted-foreground">
          {settings ? (
            <>
              <Badge
                className="w-fit rounded-full px-3 py-1"
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
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-44" />
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
            <Button
              key={section.id}
              asChild
              className="shrink-0"
              size="sm"
              variant={isActive ? "secondary" : "outline"}
            >
              <Link
                aria-current={isActive ? "page" : undefined}
                to={`/settings?section=${section.id}`}
              >
                {t(section.titleKey)}
              </Link>
            </Button>
          );
        })}
      </nav>
    ) : null;

  const renderSelfServiceCards = () => (
    <Card className="workspace-surface border-border/70">
      <CardHeader className="gap-1 border-b border-border/70 pb-5">
        <CardTitle>{t("preferencesCardTitle")}</CardTitle>
        <CardDescription className="text-ui-body">
          {t("preferencesCardDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
        <div className="space-y-3 rounded-[1.25rem] border border-border/70 bg-background/55 p-4">
          <div className="space-y-1">
            <p className="text-ui-title">{t("languageSettingTitle")}</p>
            <p className="text-ui-subtle text-muted-foreground">
              {t("languageSettingDescription")}
            </p>
          </div>
          <LanguageToggle className="h-11 justify-between md:h-10" />
        </div>
        <div className="space-y-3 rounded-[1.25rem] border border-border/70 bg-background/55 p-4">
          <div className="space-y-1">
            <p className="text-ui-title">{t("themeSettingTitle")}</p>
            <p className="text-ui-subtle text-muted-foreground">{t("themeSettingDescription")}</p>
          </div>
          <ThemeToggle
            className="h-11 justify-between md:h-10"
            onChange={(nextTheme) => preferenceMutation.mutate({ themePreference: nextTheme })}
          />
        </div>
      </CardContent>
    </Card>
  );

  const renderSecurityCard = () => (
    <Card className="workspace-surface border-border/70">
      <CardHeader className="gap-1 border-b border-border/70 pb-5">
        <CardTitle>{t("securityCardTitle")}</CardTitle>
        <CardDescription className="text-ui-body">{t("securityCardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Button
          className="w-full sm:w-auto"
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
    <Card className="workspace-surface border-border/70">
      <CardHeader className="gap-1 border-b border-border/70 pb-5">
        <CardTitle>{t("managementCardTitle")}</CardTitle>
        <CardDescription className="text-ui-body">{t("managementCardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Button asChild className="w-full sm:w-auto" type="button">
          <Link to="/users">{t("managementEntryAction")}</Link>
        </Button>
      </CardContent>
    </Card>
  );

  const renderDialog = () => (
    <ChangePasswordDialog
      open={passwordDialogOpen}
      onClose={() => setPasswordDialogOpen(false)}
      onSubmit={async (input) => {
        await passwordMutation.mutateAsync(input);
      }}
    />
  );

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
                <Skeleton className="h-72 w-full rounded-[1.5rem]" />
                <Skeleton className="h-28 w-full rounded-[1.5rem]" />
              </div>
            </CardContent>
          </Card>
        }
        title={t(sectionDefinition.titleKey)}
      />
    );
  }

  if (settingsQuery.isError && !latestSettings) {
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

  const displayedSettings = latestSettings ?? settingsQuery.data;
  const systemAside =
    activeSection === "providers" ? renderAsideCards(displayedSettings) : undefined;
  const systemMain =
    activeSection === "providers" ? (
      <ProviderForm
        initialValues={displayedSettings}
        savePending={updateMutation.isPending}
        testPending={testMutation.isPending}
        onSave={async (values) => {
          const result = await updateMutation.mutateAsync(values);
          setLatestSettings(result);
          return result;
        }}
        onTestProvider={(values) => testMutation.mutateAsync(values)}
      />
    ) : (
      <SystemPromptForm
        initialValues={displayedSettings}
        savePending={updateMutation.isPending}
        onSave={async (values) => {
          const result = await updateMutation.mutateAsync(values);
          setLatestSettings(result);
          return result;
        }}
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
