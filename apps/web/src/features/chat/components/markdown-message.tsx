/**
 * @file 聊天相关界面组件模块。
 */

import { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StreamdownTranslations } from "streamdown";

import { cn } from "@/lib/utils";
import { loadRichMarkdownRenderer } from "./rich-markdown-renderer-loader";

type MarkdownMessageProps = {
  content: string;
  isStreaming: boolean;
  testId?: string;
};

type AssistantWaitingCardProps = {
  caption?: string;
  compact?: boolean;
  detail?: string;
  frame?: "plain" | "surface";
  statusLabel: string;
  testId?: string;
};

type MarkdownRenderBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
};

type MarkdownRenderBoundaryState = {
  hasError: boolean;
};

type RichMarkdownRendererComponent = (props: {
  content: string;
  isStreaming: boolean;
  translations: Partial<StreamdownTranslations>;
}) => ReactNode;

const CJK_TEXT_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const INLINE_MATH_PATTERN =
  /^[0-9A-Za-z\s\\{}[\]()+\-*/^_=|<>.,:;%!~\u0370-\u03FF\u2200-\u22FF]+$/u;
const NUMBER_LIKE_PATTERN = /^\s*[-+]?[\d,.]+(?:\s*%)?\s*$/u;

const RICH_MARKDOWN_PATTERNS = [
  /^#{1,6}\s/m, // 标题
  /```/, // 代码块
  /^\|.+\|/m, // 表格
  /^\s*[-*+]\s/m, // 无序列表
  /^\s*\d+\.\s/m, // 有序列表
  /^\s*>\s/m, // 引用
  /!\[[^\]]*\]\([^)]+\)/, // 图片
  /\[[^\]]+\]\([^)]+\)/, // 链接
  /(^|[^\\])\*{1,2}[^*]+\*{1,2}/, // 粗体/斜体
  /(^|[^\\])_{1,2}[^_]+_{1,2}/, // 下划线
  /(^|[^\\])`[^`]+`/, // 行内代码
  /(^|[^\\])\$\$?[^$]+\$\$?/, // 数学公式
] as const;

/** 错误边界组件，捕获 Markdown 渲染错误 */
class MarkdownRenderBoundary extends Component<
  MarkdownRenderBoundaryProps,
  MarkdownRenderBoundaryState
> {
  override state: MarkdownRenderBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MarkdownRenderBoundaryState {
    return { hasError: true };
  }

  override componentDidUpdate(previousProps: MarkdownRenderBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/** 检查字符是否被转义 */
function isEscaped(content: string, index: number): boolean {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

/** 判断是否应该保留行内数学公式 */
function shouldKeepInlineMath(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed || trimmed.includes("\n")) return false;
  if (CJK_TEXT_PATTERN.test(trimmed)) return false;
  if (NUMBER_LIKE_PATTERN.test(trimmed)) return false;
  return INLINE_MATH_PATTERN.test(trimmed);
}

/** 查找配对的美元符号位置 */
function findClosingDollar(content: string, startIndex: number): number {
  for (let index = startIndex; index < content.length; index += 1) {
    if (content[index] === "\n") return -1;
    if (content[index] === "$" && !isEscaped(content, index)) return index;
  }
  return -1;
}

/** 规范化 Markdown 内容（处理数学公式等） */
function normalizeMarkdownContent(content: string): string {
  let result = "";
  let index = 0;
  let inFence = false;
  let inInlineCode = false;

  while (index < content.length) {
    // 处理代码块
    if (!inInlineCode && content.startsWith("```", index)) {
      inFence = !inFence;
      result += "```";
      index += 3;
      continue;
    }

    const char = content[index]!;

    // 处理行内代码
    if (!inFence && char === "`" && !isEscaped(content, index)) {
      inInlineCode = !inInlineCode;
      result += char;
      index += 1;
      continue;
    }

    // 处理数学公式
    if (!inFence && !inInlineCode && char === "$" && !isEscaped(content, index)) {
      const closingIndex = findClosingDollar(content, index + 1);
      if (closingIndex === -1) {
        result += char;
        index += 1;
        continue;
      }

      const segment = content.slice(index + 1, closingIndex);
      result += shouldKeepInlineMath(segment) ? `$${segment}$` : `\\$${segment}\\$`;
      index = closingIndex + 1;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

/** 判断是否需要使用富文本渲染器 */
function shouldUseRichMarkdownRenderer(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return RICH_MARKDOWN_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** 使用翻译钩子获取 Markdown 翻译 */
function useMarkdownTranslations(): Partial<StreamdownTranslations> {
  const { i18n, t } = useTranslation("chat");

  return useMemo(
    () => ({
      close: t("markdown.close"),
      copied: t("markdown.copied"),
      copyCode: t("markdown.copyCode"),
      copyLink: t("markdown.copyLink"),
      copyTable: t("markdown.copyTable"),
      copyTableAsCsv: t("markdown.copyTableAsCsv"),
      copyTableAsMarkdown: t("markdown.copyTableAsMarkdown"),
      copyTableAsTsv: t("markdown.copyTableAsTsv"),
      downloadFile: t("markdown.downloadFile"),
      downloadImage: t("markdown.downloadImage"),
      downloadTable: t("markdown.downloadTable"),
      downloadTableAsCsv: t("markdown.downloadTableAsCsv"),
      downloadTableAsMarkdown: t("markdown.downloadTableAsMarkdown"),
      exitFullscreen: t("markdown.exitFullscreen"),
      externalLinkWarning: t("markdown.externalLinkWarning"),
      imageNotAvailable: t("markdown.imageNotAvailable"),
      openExternalLink: t("markdown.openExternalLink"),
      openLink: t("markdown.openLink"),
      tableFormatCsv: t("markdown.tableFormatCsv"),
      tableFormatMarkdown: t("markdown.tableFormatMarkdown"),
      tableFormatTsv: t("markdown.tableFormatTsv"),
      viewFullscreen: t("markdown.viewFullscreen"),
    }),
    [i18n.resolvedLanguage, t],
  );
}

/**
 * 助手等待卡片组件。
 */
export function AssistantWaitingCard({
  caption,
  compact = false,
  detail,
  frame = "surface",
  statusLabel,
  testId,
}: AssistantWaitingCardProps) {
  return (
    <div
      aria-label={statusLabel}
      aria-live="polite"
      className={cn(
        "relative min-w-0 max-w-full overflow-hidden text-foreground",
        frame === "surface" ? "surface-light surface-waiting-card" : "rounded-xl",
        compact ? "px-3 py-2.5" : "px-3.5 py-3 sm:px-4 sm:py-3.5",
      )}
      data-assistant-loading-state="true"
      data-testid={testId}
      data-waiting-card-frame={frame}
      data-waiting-card-tone="assistant"
      role="status"
    >
      <div aria-hidden="true" className="waiting-card-shimmer motion-reduce:hidden" />
      <div className="relative space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div
            aria-hidden="true"
            className="surface-inline flex size-8 shrink-0 items-center justify-center rounded-full border-primary/16 bg-primary/7 text-primary/82"
          >
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="size-1.25 rounded-full bg-primary/50 [animation:chat-streaming-dot-bounce_1.4s_ease-in-out_infinite] motion-reduce:animate-none"
                  style={{ animationDelay: `${index * 160}ms` }}
                />
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            {caption && <p className="text-ui-kicker text-muted-foreground/72">{caption}</p>}
            <p className="text-[13px] font-medium text-foreground/90">{statusLabel}</p>
            {detail && <p className="text-xs leading-relaxed text-muted-foreground/68">{detail}</p>}
          </div>
        </div>
        <div aria-hidden="true" className="grid gap-2">
          <div className="h-1.5 w-24 rounded-full bg-primary/14 dark:bg-primary/20" />
          <div className="h-2 w-[78%] rounded-full bg-foreground/6 dark:bg-foreground/10" />
          <div className="h-2 w-[62%] rounded-full bg-foreground/5 dark:bg-foreground/8" />
          <div className="h-2 w-[44%] rounded-full bg-primary/8 dark:bg-primary/14" />
        </div>
      </div>
    </div>
  );
}

/**
 * 渲染聊天 Markdown 消息内容。
 */
export function MarkdownMessage({ content, isStreaming, testId }: MarkdownMessageProps) {
  const { t } = useTranslation("chat");
  const translations = useMarkdownTranslations();

  const normalizedContent = useMemo(() => normalizeMarkdownContent(content), [content]);
  const streamingFallback = t("assistantStreamingFallback");

  // 保持空预令牌状态，使等待界面保持柔和的消息形状
  const displayContent =
    isStreaming && normalizedContent === streamingFallback ? "" : normalizedContent;
  const hasVisibleContent = displayContent.trim().length > 0;
  const isPreTokenLoading = isStreaming && !hasVisibleContent;

  const needsRichRenderer = useMemo(
    () => shouldUseRichMarkdownRenderer(displayContent),
    [displayContent],
  );

  const [RichMarkdownRenderer, setRichMarkdownRenderer] =
    useState<RichMarkdownRendererComponent | null>(null);
  const [richRendererLoadFailed, setRichRendererLoadFailed] = useState(false);

  // 注意：只在 needsRichRenderer 变化时加载，避免流式更新导致重复加载
  useEffect(() => {
    if (!needsRichRenderer) {
      setRichRendererLoadFailed(false);
      return;
    }

    let cancelled = false;
    setRichRendererLoadFailed(false);

    void loadRichMarkdownRenderer()
      .then((module) => {
        if (!cancelled) setRichMarkdownRenderer(() => module.RichMarkdownRenderer);
      })
      .catch(() => {
        if (!cancelled) setRichRendererLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [needsRichRenderer]);

  const plainTextFallback = (
    <div
      className="text-ui-body break-words whitespace-pre-wrap text-foreground"
      data-markdown-fallback="true"
    >
      {displayContent}
    </div>
  );

  const shouldRenderRich = needsRichRenderer && RichMarkdownRenderer && !richRendererLoadFailed;

  return (
    <div
      aria-busy={isStreaming}
      className="min-w-0 max-w-full overflow-x-hidden pr-2 text-ui-body text-foreground"
      data-message-body="assistant"
      data-message-overflow="managed"
      data-testid={testId}
    >
      {isPreTokenLoading ? (
        <AssistantWaitingCard compact frame="plain" statusLabel={t("assistantStreamingStatus")} />
      ) : (
        <MarkdownRenderBoundary
          fallback={plainTextFallback}
          resetKey={`${isStreaming ? "streaming" : "static"}:${displayContent}`}
        >
          {shouldRenderRich ? (
            <RichMarkdownRenderer
              content={displayContent}
              isStreaming={isStreaming}
              translations={translations}
            />
          ) : (
            plainTextFallback
          )}
        </MarkdownRenderBoundary>
      )}
    </div>
  );
}
