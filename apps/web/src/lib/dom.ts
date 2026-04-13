export function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  link.target = "_blank";
  document.body.append(link);
  link.click();
  link.remove();
}

export function isInputComposing(event: React.KeyboardEvent<HTMLElement>) {
  return event.nativeEvent.isComposing;
}

export function applyNoTranslateAttributes(targets: Element[]) {
  if (typeof document === "undefined") {
    return;
  }

  for (const target of targets) {
    target.setAttribute("translate", "no");
    target.classList.add("notranslate");
  }
}
