import { applyNoTranslateAttributes } from "./no-translate";

describe("applyNoTranslateAttributes", () => {
  it("marks the provided targets as non-translatable", () => {
    const html = document.createElement("html");
    const body = document.createElement("body");
    const root = document.createElement("div");

    applyNoTranslateAttributes([html, body, root]);

    expect(html).toHaveAttribute("translate", "no");
    expect(body).toHaveAttribute("translate", "no");
    expect(root).toHaveAttribute("translate", "no");
    expect(html).toHaveClass("notranslate");
    expect(body).toHaveClass("notranslate");
    expect(root).toHaveClass("notranslate");
  });
});
