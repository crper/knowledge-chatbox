/**
 * @file 共享加载状态组件。
 */

import { useTranslation } from "react-i18next";

/**
 * 骨架屏脉冲动画块。
 */
function SkeletonPulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} aria-hidden="true" />;
}

/**
 * 聊天消息骨架屏。
 */
export function ChatMessageSkeleton() {
  return (
    <div className="flex w-full flex-col gap-3 py-4">
      {/* 头部：角色标签 + 状态 */}
      <div className="flex items-center gap-2">
        <SkeletonPulse className="h-5 w-16" />
        <SkeletonPulse className="h-4 w-20" />
      </div>
      {/* 消息内容 */}
      <div className="space-y-2">
        <SkeletonPulse className="h-4 w-full max-w-[90%]" />
        <SkeletonPulse className="h-4 w-full max-w-[75%]" />
        <SkeletonPulse className="h-4 w-full max-w-[60%]" />
      </div>
    </div>
  );
}

/**
 * 文档列表骨架屏。
 */
export function DocumentListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/50 p-3"
        >
          <SkeletonPulse className="h-8 w-8 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-full max-w-[200px]" />
            <SkeletonPulse className="h-3 w-full max-w-[120px]" />
          </div>
          <SkeletonPulse className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * 通用卡片骨架屏。
 */
export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <div className="space-y-3">
        <SkeletonPulse className="h-5 w-1/3" />
        <SkeletonPulse className="h-4 w-full" />
        <SkeletonPulse className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/**
 * 渲染加载状态。
 */
export function LoadingState() {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      {/* 加载动画 */}
      <div className="relative flex items-center justify-center">
        <div className="absolute size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <div className="size-8" />
      </div>
      {/* 加载文本 */}
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    </div>
  );
}

/**
 * 渲染带骨架屏的加载状态。
 */
export function LoadingStateWithSkeleton({
  variant = "default",
  skeletonCount = 3,
}: {
  variant?: "default" | "chat" | "documents" | "card";
  skeletonCount?: number;
}) {
  const { t } = useTranslation("common");

  return (
    <div className="w-full animate-fade-in">
      {/* 骨架屏内容 */}
      <div className="space-y-4">
        {variant === "chat" &&
          Array.from({ length: skeletonCount }).map((_, index) => (
            <ChatMessageSkeleton key={index} />
          ))}
        {variant === "documents" && <DocumentListSkeleton count={skeletonCount} />}
        {variant === "card" &&
          Array.from({ length: skeletonCount }).map((_, index) => <CardSkeleton key={index} />)}
        {variant === "default" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="relative flex items-center justify-center">
              <div className="absolute size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <div className="size-8" />
            </div>
          </div>
        )}
      </div>
      {/* 加载提示 */}
      <p className="mt-4 text-center text-xs text-muted-foreground/70">{t("loading")}</p>
    </div>
  );
}
