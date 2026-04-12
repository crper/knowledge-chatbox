/**
 * @file 资源文本预览组件模块。
 */

import { MarkdownMessage } from "@/features/chat/components/markdown-message";

type DocumentTextPreviewProps = {
  content: string;
  mode: "markdown" | "text";
};

/**
 * 渲染资源文本预览。
 */
export function DocumentTextPreview({ content, mode }: DocumentTextPreviewProps) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-4">
      {mode === "markdown" ? (
        <MarkdownMessage content={content} isStreaming={false} />
      ) : (
        <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          {content}
        </pre>
      )}
    </div>
  );
}
