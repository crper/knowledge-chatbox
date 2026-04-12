/**
 * @file 资源页主区空状态模块。
 */

import type { FileRejection } from "react-dropzone";
import { UploadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FileDropzone } from "@/components/upload/file-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type KnowledgeEmptyStateProps = {
  canManageDocuments: boolean;
  onFilesAccepted: (files: File[]) => void;
  onFilesRejected: (rejections: FileRejection[]) => void;
  uploadBlocked: boolean;
  uploadReadinessChecking: boolean;
};

/**
 * 渲染资源页主区的 onboarding / readonly 空状态。
 */
export function KnowledgeEmptyState({
  canManageDocuments,
  onFilesAccepted,
  onFilesRejected,
  uploadBlocked,
  uploadReadinessChecking,
}: KnowledgeEmptyStateProps) {
  const { t } = useTranslation("knowledge");

  if (!canManageDocuments) {
    return (
      <Empty className="min-h-[24rem] rounded-3xl border border-dashed border-border/70 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_36%),linear-gradient(180deg,hsl(var(--background)/0.72),hsl(var(--muted)/0.34))] px-6 py-8">
        <EmptyHeader className="max-w-xl gap-3">
          <Badge className="text-ui-kicker rounded-full px-3 py-1" variant="outline">
            {t("emptyReadonlyFlowBadge")}
          </Badge>
          <EmptyMedia
            className="surface-light size-12 rounded-2xl text-primary [&_svg]:size-5"
            variant="icon"
          >
            <UploadIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle aria-level={2} className="text-ui-heading" role="heading">
            {t("emptyReadonlyTitle")}
          </EmptyTitle>
          <EmptyDescription className="text-ui-body measure-readable max-w-xl">
            {t("emptyReadonlyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <FileDropzone
      disabled={uploadBlocked}
      onFilesAccepted={onFilesAccepted}
      onFilesRejected={onFilesRejected}
    >
      {({ getInputProps, getRootProps, isDragAccept, isDragActive, isDragReject, open }) => (
        <Empty
          {...getRootProps({
            className: cn(
              "min-h-[24rem] select-none rounded-3xl border border-dashed border-border/70 bg-[radial-gradient(ellipse_56%_40%_at_top,hsl(var(--primary)/0.07),transparent_44%),linear-gradient(180deg,hsl(var(--background)/0.72),hsl(var(--muted)/0.34))] px-6 py-8 transition-[color,border-color,background,transform,box-shadow] duration-200 ease-out",
              isDragAccept &&
                "border-primary/46 bg-primary/6 scale-[1.005] shadow-[0_16px_36px_-20px_hsl(var(--primary)/0.18)]",
              isDragReject && "border-destructive/46 bg-destructive/8 scale-[0.998]",
            ),
          })}
        >
          <input {...getInputProps({ "aria-label": t("uploadAction") })} />
          <EmptyHeader className="max-w-xl gap-3">
            <Badge className="text-ui-kicker rounded-full px-3 py-1" variant="outline">
              {t("emptyOnboardingFlowBadge")}
            </Badge>
            <EmptyMedia
              className="surface-light size-12 rounded-2xl text-primary [&_svg]:size-5"
              variant="icon"
            >
              <UploadIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle aria-level={2} className="text-ui-heading" role="heading">
              {t("emptyOnboardingTitle")}
            </EmptyTitle>
            <EmptyDescription className="text-ui-body measure-readable max-w-xl">
              {t("emptyOnboardingDescription")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="max-w-xl gap-4">
            <div className="grid w-full gap-2 text-left">
              <div className="surface-light text-ui-subtle select-none rounded-2xl px-4 py-3 text-muted-foreground">
                {t("emptyOnboardingStepOne")}
              </div>
              <div className="surface-light text-ui-subtle select-none rounded-2xl px-4 py-3 text-muted-foreground">
                {t("emptyOnboardingStepTwo")}
              </div>
            </div>
            <div className="surface-light select-none rounded-2xl border-dashed px-4 py-3 text-left">
              <p className="text-sm font-medium text-foreground">{t("dropzoneTitle")}</p>
              <p
                className={cn(
                  "mt-1 text-xs text-muted-foreground",
                  isDragReject && "text-destructive",
                  isDragAccept && "text-primary",
                )}
              >
                {isDragReject
                  ? t("dropzoneRejectHint")
                  : isDragActive
                    ? t("dropzoneActiveHint")
                    : t("dropzoneHint")}
              </p>
            </div>
            <Button
              disabled={uploadBlocked || uploadReadinessChecking}
              onClick={open}
              type="button"
            >
              <UploadIcon data-icon="inline-start" />
              {t("uploadAction")}
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </FileDropzone>
  );
}
