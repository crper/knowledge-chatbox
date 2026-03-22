/**
 * @file 禁止浏览器自动翻译的 DOM 辅助模块。
 */

type NoTranslateTarget = Element | null | undefined;

/**
 * 给目标节点及其子树加上禁止翻译标记。
 */
export function applyNoTranslateAttributes(targets: NoTranslateTarget[]) {
  if (typeof document === "undefined") {
    return;
  }

  for (const target of targets) {
    if (!target) {
      continue;
    }

    target.setAttribute("translate", "no");
    target.classList.add("notranslate");
  }
}
