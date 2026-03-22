import { describe, expect, it } from "vite-plus/test";

import { WORKSPACE_LINKS, getWorkspaceLabelKey } from "./workspace-links";

describe("workspace-links", () => {
  it("defines the primary workspace modes in a stable order", () => {
    expect(WORKSPACE_LINKS.map((link) => link.to)).toEqual(["/chat", "/knowledge"]);
    expect(WORKSPACE_LINKS.map((link) => link.labelKey)).toEqual(["navChat", "navKnowledge"]);
  });

  it("maps routes to the expected workspace label key", () => {
    expect(getWorkspaceLabelKey("/chat")).toBe("navChat");
    expect(getWorkspaceLabelKey("/knowledge")).toBe("navKnowledge");
    expect(getWorkspaceLabelKey("/settings?section=security")).toBe("navSettings");
    expect(getWorkspaceLabelKey("/users")).toBe("navUsers");
  });
});
