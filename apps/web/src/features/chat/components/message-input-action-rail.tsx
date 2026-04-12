/**
 * @file 聊天输入区底部操作栏模块。
 */

import { cva } from "class-variance-authority";
import { LoaderCircleIcon, PaperclipIcon, SendHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ChatReasoningMode } from "../api/chat";

const composerSurfaceVariants = cva(
  "border transition-[background-color,border-color,box-shadow,color] dark:bg-input/84",
  {
    variants: {
      surface: {
        default:
          "border-border/68 bg-input/72 shadow-[0_8px_18px_-18px_hsl(var(--shadow-color)/0.2)]",
      },
    },
  },
);

const composerTouchVariants = cva(
  "min-h-[2.625rem] focus-visible:border-ring focus-visible:bg-input focus-visible:ring-3 focus-visible:ring-ring/42 md:min-h-9",
);

type ReasoningLabels = {
  default: string;
  label: string;
  off: string;
  on: string;
};

type MessageInputActionRailProps = {
  activeModelActionLabel?: string | null;
  activeModelLabel?: string | null;
  canSubmit: boolean;
  onActionPointerDown: () => void;
  onActiveModelAction?: () => void;
  onOpenAttachments: () => void;
  onReasoningModeChange?: (mode: ChatReasoningMode) => void;
  onStopSubmit?: () => void;
  reasoningLabels: ReasoningLabels;
  reasoningMode: ChatReasoningMode;
  reasoningModeVisible: boolean;
  sendLabel: string;
  sendingLabel: string;
  stopSubmitLabel: string;
  submitPending: boolean;
  submitPendingHint: string;
};

/**
 * 渲染聊天输入区底部附件、上下文控制和发送操作。
 */
export function MessageInputActionRail({
  activeModelActionLabel = null,
  activeModelLabel = null,
  canSubmit,
  onActionPointerDown,
  onActiveModelAction,
  onOpenAttachments,
  onReasoningModeChange,
  onStopSubmit,
  reasoningLabels,
  reasoningMode,
  reasoningModeVisible,
  sendLabel,
  sendingLabel,
  stopSubmitLabel,
  submitPending,
  submitPendingHint,
}: MessageInputActionRailProps) {
  const hasContextControls = Boolean(
    activeModelActionLabel || activeModelLabel || reasoningModeVisible,
  );

  return (
    <div
      className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 border-t border-border/60 pt-2.5 sm:mt-3 sm:gap-x-2.5 sm:gap-y-2 sm:pt-3"
      data-testid="message-input-actions"
      onPointerDownCapture={onActionPointerDown}
    >
      <Button
        aria-label="附加资源"
        className={cn(
          composerSurfaceVariants({ surface: "default" }),
          composerTouchVariants(),
          "col-start-1 row-start-1 size-[2.625rem] self-start rounded-full border-border/60 hover:bg-background/36 md:size-9",
        )}
        disabled={submitPending}
        onClick={onOpenAttachments}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <PaperclipIcon className="size-4 md:size-3.5" />
      </Button>

      {hasContextControls ? (
        <div className="col-start-2 row-start-1 grid min-w-0 gap-2 sm:flex sm:min-w-0 sm:flex-1 sm:flex-row sm:items-center sm:gap-2">
          {activeModelActionLabel ? (
            <Button
              className={cn(
                composerSurfaceVariants({ surface: "default" }),
                composerTouchVariants(),
                "w-full min-w-0 justify-start rounded-xl px-2.5 py-1.5 text-ui-caption text-foreground shadow-none hover:bg-background/34 hover:text-foreground sm:max-w-[min(48vw,20rem)] sm:px-3 sm:py-2",
              )}
              onClick={onActiveModelAction}
              size="sm"
              title={activeModelActionLabel}
              type="button"
              variant="ghost"
            >
              <span className="truncate">{activeModelActionLabel}</span>
            </Button>
          ) : activeModelLabel ? (
            <div
              className={cn(
                composerSurfaceVariants({ surface: "default" }),
                composerTouchVariants(),
                "flex w-full min-w-0 select-none items-center rounded-xl px-2.5 py-1.5 text-ui-caption text-foreground sm:max-w-[min(48vw,20rem)] sm:px-3 sm:py-2",
              )}
              title={activeModelLabel}
            >
              <span className="truncate">{activeModelLabel}</span>
            </div>
          ) : null}

          {reasoningModeVisible ? (
            <Select
              disabled={submitPending}
              items={[
                { label: reasoningLabels.default, value: "default" },
                { label: reasoningLabels.off, value: "off" },
                { label: reasoningLabels.on, value: "on" },
              ]}
              onValueChange={(value) => onReasoningModeChange?.(value as ChatReasoningMode)}
              value={reasoningMode}
            >
              <SelectTrigger
                aria-label={reasoningLabels.label}
                className={cn(
                  composerSurfaceVariants({ surface: "default" }),
                  composerTouchVariants(),
                  "w-full min-w-0 rounded-xl px-2.5 text-ui-caption sm:min-w-28 sm:w-auto sm:px-3",
                )}
              >
                <SelectValue>{() => reasoningLabels[reasoningMode]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{reasoningLabels.default}</SelectItem>
                <SelectItem value="off">{reasoningLabels.off}</SelectItem>
                <SelectItem value="on">{reasoningLabels.on}</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}

      <Button
        aria-label={submitPending ? stopSubmitLabel : sendLabel}
        className={cn(
          "col-start-3 row-start-1 size-[2.625rem] self-start rounded-full md:size-9",
          submitPending &&
            "border-primary/14 bg-foreground text-background shadow-[0_14px_28px_-18px_hsl(var(--shadow-color)/0.46)] hover:bg-foreground/95",
        )}
        disabled={submitPending ? !onStopSubmit : !canSubmit}
        onClick={submitPending ? onStopSubmit : undefined}
        size="icon"
        type={submitPending ? "button" : "submit"}
      >
        {submitPending ? (
          <span aria-hidden="true" className="relative flex size-4 items-center justify-center">
            <LoaderCircleIcon className="absolute size-4 animate-spin opacity-45" />
            <span className="relative size-1.5 rounded-[2px] bg-current" />
          </span>
        ) : (
          <SendHorizontalIcon aria-hidden="true" className="size-4" />
        )}
      </Button>

      {submitPending ? (
        <>
          <p className="col-start-2 row-start-2 min-w-0 px-1 text-[11px] text-muted-foreground/72 sm:text-ui-caption">
            {submitPendingHint}
          </p>
          <span
            aria-atomic="true"
            aria-label={sendingLabel}
            aria-live="polite"
            className="sr-only"
            role="status"
          >
            {sendingLabel}
          </span>
        </>
      ) : null}
    </div>
  );
}
