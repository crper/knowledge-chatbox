import { http } from "msw";
import { apiResponse, overrideHandler } from "@/test/msw";
import { createUser, deleteUser, getUsers, resetUserPassword, updateUser } from "./users";

describe("users api", () => {
  it("gets user list", async () => {
    overrideHandler(
      http.get("*/api/users", () => {
        return apiResponse([{ id: 1, username: "alice" }]);
      }),
    );

    const result = await getUsers();

    expect(result).toHaveLength(1);
  });

  it("creates a user", async () => {
    overrideHandler(
      http.post("*/api/users", () => {
        return apiResponse({ id: 2, username: "bob" });
      }),
    );

    await createUser({ username: "bob", password: "secret", role: "user" });
  });

  it("updates a user", async () => {
    overrideHandler(
      http.patch("*/api/users/2", () => {
        return apiResponse({ id: 2, status: "disabled" });
      }),
    );

    await updateUser(2, { status: "disabled" });
  });

  it("deletes a user", async () => {
    overrideHandler(
      http.delete("*/api/users/2", () => {
        return apiResponse({ deleted: true });
      }),
    );

    await deleteUser(2);
  });

  it("resets a user password", async () => {
    overrideHandler(
      http.post("*/api/users/2/reset-password", () => {
        return apiResponse({ success: true });
      }),
    );

    await resetUserPassword(2, "new-secret");
  });
});
