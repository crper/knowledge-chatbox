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
  /^#{1,6}\s/m,
  /```/,
  /^\|.+\|/m,
  /^\s*[-*+]\s/m,
  /^\s*\d+\.\s/m,
  /^\s*>\s/m,
  /!\[[^\]]*\]\([^)]+\)/,
  /\[[^\]]+\]\([^)]+\)/,
  /(^|[^\\])\*{1,2}[^*]+\*{1,2}/,
  /(^|[^\\])_{1,2}[^_]+_{1,2}/,
  /(^|[^\\])`[^`]+`/,
  /(^|[^\\])\$\$?[^$]+\$\$?/,
] as const;

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
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function isEscaped(content: string, index: number) {
  let backslashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function shouldKeepInlineMath(segment: string) {
  const trimmed = segment.trim();

  if (!trimmed || trimmed.includes("\n")) {
    return false;
  }

  if (CJK_TEXT_PATTERN.test(trimmed)) {
    return false;
  }

  if (NUMBER_LIKE_PATTERN.test(trimmed)) {
    return false;
  }

  return INLINE_MATH_PATTERN.test(trimmed);
}

function findClosingDollar(content: string, startIndex: number) {
  for (let index = startIndex; index < content.length; index += 1) {
    if (content[index] === "\n") {
      return -1;
    }

    if (content[index] === "$" && !isEscaped(content, index)) {
      return index;
    }
  }

  return -1;
}

function normalizeMarkdownContent(content: string) {
  let result = "";
  let index = 0;
  let inFence = false;
  let inInlineCode = false;

  while (index < content.length) {
    if (!inInlineCode && content.startsWith("```", index)) {
      inFence = !inFence;
      result += "```";
      index += 3;
      continue;
    }

    const char = content[index]!;

    if (!inFence && char === "`" && !isEscaped(content, index)) {
      inInlineCode = !inInlineCode;
      result += char;
      index += 1;
      continue;
    }

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

function shouldUseRichMarkdownRenderer(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    return false;
  }

  return RICH_MARKDOWN_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function AssistantWaitingCard({
  caption,
  compact = false,
  detail,
  statusLabel,
  testId,
}: AssistantWaitingCardProps) {
  return (
    <div
      aria-label={statusLabel}
      aria-live="polite"
      className={cn(
        "surface-outline relative min-w-0 max-w-full overflow-hidden rounded-[1.2rem] border-primary/12 bg-[linear-gradient(180deg,hsl(var(--primary)/0.055),transparent_38%),linear-gradient(145deg,hsl(var(--surface-top)/0.72),hsl(var(--surface-base)/0.9))] text-foreground shadow-[0_12px_28px_-24px_hsl(var(--shadow-color)/0.34),inset_0_1px_0_hsl(var(--surface-highlight)/0.07)] dark:border-primary/18 dark:bg-[linear-gradient(180deg,hsl(var(--primary)/0.08),transparent_36%),linear-gradient(145deg,hsl(var(--surface-top)/0.62),hsl(var(--surface-base)/0.88))]",
        compact ? "px-4 py-3" : "px-4 py-3.5 sm:px-5 sm:py-4",
      )}
      data-assistant-loading-state="true"
      data-testid={testId}
      data-waiting-card-tone="assistant"
      role="status"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent_0%,hsl(var(--primary)/0.12)_42%,transparent_78%)] [animation:assistant-loading-shimmer_2.8s_ease-in-out_infinite] motion-reduce:hidden"
      />
      <div className="relative space-y-3">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="surface-icon flex size-9 shrink-0 items-center justify-center rounded-full border-primary/18 bg-primary/8 text-primary"
          >
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="size-1.5 rounded-full bg-primary/55 [animation:chat-streaming-dot-bounce_1.4s_ease-in-out_infinite] motion-reduce:animate-none"
                  style={{ animationDelay: `${index * 160}ms` }}
                />
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {caption ? (
              <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {caption}
              </p>
            ) : null}
            <p className="text-[0.95rem] font-medium leading-6 text-foreground/92">{statusLabel}</p>
            {detail ? (
              <p className="text-[0.82rem] leading-6 text-muted-foreground">{detail}</p>
            ) : null}
          </div>
        </div>
        <div aria-hidden="true" className="grid gap-2.5">
          <div className="h-2 w-24 rounded-full bg-primary/16 dark:bg-primary/22" />
          <div className="h-2.5 w-[78%] rounded-full bg-foreground/8 dark:bg-foreground/12" />
          <div className="h-2.5 w-[62%] rounded-full bg-foreground/6 dark:bg-foreground/10" />
          <div className="h-2.5 w-[44%] rounded-full bg-primary/10 dark:bg-primary/16" />
        </div>
      </div>
    </div>
  );
}

/**
 * 渲染聊天 Markdown 消息内容。
 */
export function MarkdownMessage({ content, isStreaming, testId }: MarkdownMessageProps) {
  const { i18n, t } = useTranslation("chat");
  const normalizedContent = useMemo(() => normalizeMarkdownContent(content), [content]);
  const streamingFallback = t("assistantStreamingFallback");
  // Keep the empty pre-token state on our side so the waiting surface stays soft and
  // message-shaped instead of falling back to Streamdown's default loading bar.
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
  const plainTextFallback = (
    <div
      className="text-sm leading-7 break-words whitespace-pre-wrap text-foreground"
      data-markdown-fallback="true"
    >
      {displayContent}
    </div>
  );

  useEffect(() => {
    if (!needsRichRenderer) {
      setRichRendererLoadFailed(false);
      return;
    }

    let cancelled = false;
    setRichRendererLoadFailed(false);

    void loadRichMarkdownRenderer()
      .then((module) => {
        if (!cancelled) {
          setRichMarkdownRenderer(() => module.RichMarkdownRenderer);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRichRendererLoadFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [displayContent, needsRichRenderer]);

  const translations = useMemo<Partial<StreamdownTranslations>>(
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
  const shouldRenderRich =
    needsRichRenderer && RichMarkdownRenderer !== null && !richRendererLoadFailed;

  return (
    <div
      aria-busy={isStreaming}
      className="min-w-0 max-w-full overflow-x-hidden pr-2 text-sm leading-7 text-foreground"
      data-message-body="assistant"
      data-message-overflow="managed"
      data-testid={testId}
    >
      {isPreTokenLoading ? (
        <AssistantWaitingCard compact={true} statusLabel={t("assistantStreamingStatus")} />
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
