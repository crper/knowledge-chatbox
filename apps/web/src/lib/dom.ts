import type { KeyboardEvent } from "react";

export function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  link.target = "_blank";
  link.click();
}

export function isInputComposing(event: KeyboardEvent<HTMLElement>) {
  return (
    event.nativeEvent.isComposing ||
    Boolean((event as KeyboardEvent<HTMLElement> & { isComposing?: boolean }).isComposing)
  );
}
