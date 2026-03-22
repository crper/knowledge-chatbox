import { readFileSync } from "node:fs";

describe("nginx config", () => {
  it("allows large upload bodies for docker single-machine mode", () => {
    const config = readFileSync("./nginx.conf", "utf8");

    expect(config).toContain("client_max_body_size 2g;");
  });
});
