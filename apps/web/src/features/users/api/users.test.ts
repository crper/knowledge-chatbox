import { jsonResponse } from "@/test/http";
import { createUser, deleteUser, getUsers, resetUserPassword, updateUser } from "./users";

function apiPath(path: string) {
  return expect.stringMatching(new RegExp(`${path.replaceAll("/", "\\/")}$`));
}

describe("users api", () => {
  it("gets user list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, data: [{ id: 1, username: "alice" }], error: null }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getUsers();

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/users"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toHaveLength(1);
  });

  it("creates a user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, data: { id: 2, username: "bob" }, error: null }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createUser({ username: "bob", password: "secret", role: "user" });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/users"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("updates a user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, data: { id: 2, status: "disabled" }, error: null }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await updateUser(2, { status: "disabled" });

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/users/2"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("resets password", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { id: 2 }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    await resetUserPassword(2, "new-secret");

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/users/2/reset-password"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("deletes a user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { status: "deleted" }, error: null }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteUser(2);

    expect(fetchMock).toHaveBeenCalledWith(
      apiPath("/api/users/2"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
