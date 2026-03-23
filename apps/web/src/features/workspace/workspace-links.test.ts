import { describe, expect, it } from "vite-plus/test";

import { getWorkspaceLabelKey } from "./workspace-links";

describe("workspace-links", () => {
  it("maps routes to the expected workspace label key", () => {
    expect(getWorkspaceLabelKey("/chat")).toBe("navChat");
    expect(getWorkspaceLabelKey("/chat/123")).toBe("navChat");
    expect(getWorkspaceLabelKey("/knowledge")).toBe("navKnowledge");
    expect(getWorkspaceLabelKey("/settings?section=security")).toBe("navSettings");
    expect(getWorkspaceLabelKey("/users")).toBe("navUsers");
  });
});
