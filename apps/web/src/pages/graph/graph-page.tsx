/**
 * @file 图谱页面模块。
 */

import { useTranslation } from "react-i18next";

import { WorkspacePage } from "@/components/shared/workspace-page";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { OrbitIcon } from "lucide-react";

export function GraphPage() {
  const { t } = useTranslation("common");

  return (
    <WorkspacePage
      badge={t("graphBadge")}
      description={t("graphDescription")}
      main={
        <Empty className="min-h-[24rem] rounded-3xl border border-dashed border-border/60 bg-background/60">
          <EmptyHeader className="max-w-xl gap-3">
            <EmptyMedia
              className="surface-light size-12 rounded-2xl text-primary [&_svg]:size-5"
              variant="icon"
            >
              <OrbitIcon aria-hidden="true" />
            </EmptyMedia>
            <Badge className="rounded-full px-3 py-1" variant="outline">
              {t("graphBadge")}
            </Badge>
            <EmptyTitle aria-level={2} className="text-ui-heading" role="heading">
              {t("graphEmptyTitle")}
            </EmptyTitle>
            <EmptyDescription className="text-ui-body measure-readable max-w-xl">
              {t("graphEmptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
      surface="flat"
      title={t("graphTitle")}
      width="wide"
    />
  );
}
