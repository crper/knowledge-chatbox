/**
 * @file Provider 状态摘要分区模块。
 */

import { formatProviderProfile } from "@/lib/provider-display";
import { getIndexStatusLabel } from "../utils/index-status";
import type { AppSettings } from "../api/settings";
import { buildStatusSummary, providerFormInsetSectionClassName } from "./provider-form-shared";

export function ProviderStatusSummary({
  initialValues,
  t,
}: {
  initialValues: AppSettings;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const statusSummary = buildStatusSummary(initialValues, t);

  return (
    <section className="rounded-[1.5rem] border border-border/60 bg-background/45 px-5 py-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium">{t("statusSummaryTitle")}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className={providerFormInsetSectionClassName}>
          <p className="text-xs font-medium text-muted-foreground">{t("statusChatLabel")}</p>
          <p className="mt-2 text-sm font-medium">{statusSummary.response}</p>
        </div>
        <div className={providerFormInsetSectionClassName}>
          <p className="text-xs font-medium text-muted-foreground">{t("statusRetrievalLabel")}</p>
          <p className="mt-2 text-sm font-medium">{statusSummary.embedding}</p>
          {initialValues.pending_embedding_route ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("pendingRetrievalProfileLabel")}
              {formatProviderProfile(
                initialValues.pending_embedding_route.provider,
                initialValues.pending_embedding_route.model,
                t,
              )}
            </p>
          ) : null}
        </div>
        <div className={providerFormInsetSectionClassName}>
          <p className="text-xs font-medium text-muted-foreground">{t("statusVisionLabel")}</p>
          <p className="mt-2 text-sm font-medium">{statusSummary.vision}</p>
        </div>
        <div className={providerFormInsetSectionClassName}>
          <p className="text-xs font-medium text-muted-foreground">{t("indexStatusCardTitle")}</p>
          <p className="mt-2 text-sm font-medium">
            {getIndexStatusLabel(initialValues.index_rebuild_status, t)}
          </p>
        </div>
      </div>
    </section>
  );
}
