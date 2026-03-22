/**
 * @file 聊天相关界面组件模块。
 */

import { Component, type ReactNode, useMemo } from "react";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { useTranslation } from "react-i18next";
import { Streamdown, type StreamdownTranslations } from "streamdown";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";

const streamdownPlugins = {
  code,
  cjk,
  mermaid,
  math: createMathPlugin({ singleDollarTextMath: true }),
} as const;
const streamdownControls = {
  code: { copy: true, download: true },
  table: { copy: true, download: true, fullscreen: true },
} as const;

type MarkdownMessageProps = {
  content: string;
  isStreaming: boolean;
};

type AssistantSoftLoadingStateProps = {
  statusLabel: string;
};

type MarkdownRenderBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
};

type MarkdownRenderBoundaryState = {
  hasError: boolean;
};

const CJK_TEXT_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const INLINE_MATH_PATTERN =
  /^[0-9A-Za-z\s\\{}[\]()+\-*/^_=|<>.,:;%!~\u0370-\u03FF\u2200-\u22FF]+$/u;
const NUMBER_LIKE_PATTERN = /^\s*[-+]?[\d,.]+(?:\s*%)?\s*$/u;

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

function AssistantSoftLoadingState({ statusLabel }: AssistantSoftLoadingStateProps) {
  return (
    <div
      aria-label={statusLabel}
      aria-live="polite"
      className="surface-outline relative overflow-hidden rounded-[1.2rem] px-4 py-3"
      data-assistant-loading-state="true"
      role="status"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent_0%,hsl(var(--primary)/0.08)_42%,transparent_78%)] [animation:assistant-loading-shimmer_2.8s_ease-in-out_infinite]"
      />
      <div className="relative flex items-center gap-2 text-muted-foreground">
        <div aria-hidden="true" className="flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="size-1.5 rounded-full bg-primary/45 [animation:chat-streaming-dot-bounce_1.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${index * 160}ms` }}
            />
          ))}
        </div>
        <span className="text-[0.92rem] leading-6">{statusLabel}</span>
      </div>
      <div aria-hidden="true" className="relative mt-3 space-y-2.5">
        <div className="h-2 w-24 rounded-full bg-primary/12" />
        <div className="h-2.5 w-[72%] rounded-full bg-foreground/8" />
        <div className="h-2.5 w-[54%] rounded-full bg-foreground/6" />
      </div>
    </div>
  );
}

/**
 * 渲染聊天 Markdown 消息内容。
 */
export function MarkdownMessage({ content, isStreaming }: MarkdownMessageProps) {
  const { i18n, t } = useTranslation("chat");
  const normalizedContent = useMemo(() => normalizeMarkdownContent(content), [content]);
  const streamingFallback = t("assistantStreamingFallback");
  // Keep the empty pre-token state on our side so the waiting surface stays soft and
  // message-shaped instead of falling back to Streamdown's default loading bar.
  const displayContent =
    isStreaming && normalizedContent === streamingFallback ? "" : normalizedContent;
  const hasVisibleContent = displayContent.trim().length > 0;
  const isPreTokenLoading = isStreaming && !hasVisibleContent;
  const caret = isStreaming ? (hasVisibleContent ? "block" : "circle") : undefined;
  const plainTextFallback = (
    <div
      className="text-sm leading-7 break-words whitespace-pre-wrap text-foreground"
      data-markdown-fallback="true"
    >
      {displayContent}
    </div>
  );
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

  return (
    <div
      aria-busy={isStreaming}
      className="max-w-none pr-2 text-sm leading-7 text-foreground"
      data-message-body="assistant"
    >
      {isPreTokenLoading ? (
        <AssistantSoftLoadingState statusLabel={t("assistantStreamingStatus")} />
      ) : (
        <MarkdownRenderBoundary
          fallback={plainTextFallback}
          resetKey={`${isStreaming ? "streaming" : "static"}:${displayContent}`}
        >
          <Streamdown
            animated={{ animation: "blurIn", duration: 220, easing: "ease-out" }}
            caret={caret}
            className="text-sm leading-7 [&>*]:my-0 [&>blockquote]:border-l-2 [&>blockquote]:border-border/70 [&>blockquote]:pl-4 [&>h1]:text-lg [&>h1]:font-semibold [&>h2]:text-base [&>h2]:font-semibold [&>hr]:my-0 [&>ol]:pl-5 [&>pre]:overflow-x-auto [&>ul]:pl-5"
            controls={streamdownControls}
            isAnimating={isStreaming}
            mode={isStreaming ? "streaming" : "static"}
            normalizeHtmlIndentation
            plugins={streamdownPlugins}
            translations={translations}
          >
            {displayContent}
          </Streamdown>
        </MarkdownRenderBoundary>
      )}
    </div>
  );
}
