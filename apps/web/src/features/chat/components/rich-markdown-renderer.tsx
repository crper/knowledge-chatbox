import { useMemo } from "react";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown, type StreamdownTranslations } from "streamdown";
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

type RichMarkdownRendererProps = {
  content: string;
  isStreaming: boolean;
  translations: Partial<StreamdownTranslations>;
};

export function RichMarkdownRenderer({
  content,
  isStreaming,
  translations,
}: RichMarkdownRendererProps) {
  const caret = isStreaming ? "block" : undefined;
  const resolvedTranslations = useMemo(() => translations, [translations]);

  return (
    <Streamdown
      animated={{ animation: "blurIn", duration: 220, easing: "ease-out" }}
      caret={caret}
      className="min-w-0 max-w-full text-sm leading-7 [&>*]:my-0 [&>blockquote]:border-l-2 [&>blockquote]:border-border/70 [&>blockquote]:pl-4 [&>h1]:text-lg [&>h1]:font-semibold [&>h2]:text-base [&>h2]:font-semibold [&>hr]:my-0 [&>ol]:pl-5 [&>pre]:overflow-x-auto [&>ul]:pl-5 [&_[data-streamdown=code-block]]:max-w-full [&_[data-streamdown=image-wrapper]]:block [&_[data-streamdown=image-wrapper]]:max-w-full [&_[data-streamdown=image]]:block [&_[data-streamdown=image]]:h-auto [&_[data-streamdown=image]]:max-w-full [&_[data-streamdown=mermaid-block]]:max-w-full [&_[data-streamdown=table-wrapper]]:max-w-full"
      controls={streamdownControls}
      isAnimating={isStreaming}
      mode={isStreaming ? "streaming" : "static"}
      normalizeHtmlIndentation
      plugins={streamdownPlugins}
      translations={resolvedTranslations}
    >
      {content}
    </Streamdown>
  );
}
