import { http } from "msw";
import type { AppUser } from "@/lib/api/client";
import { buildAppUser } from "@/test/fixtures/app";
import { apiResponse, apiError } from "./utils";

type UsersHandlersOptions = {
  users?: AppUser[];
};

export function createUsersHandlers(options: UsersHandlersOptions = {}) {
  const { users = [buildAppUser("admin")] } = options;

  return [
    http.get("*/api/users", () => {
      return apiResponse(users);
    }),

    http.post("*/api/users", async ({ request }) => {
      const body = (await request.json()) as {
        username?: string;
        password?: string;
        role?: string;
      };

      if (!body?.username || !body?.password) {
        return apiError(
          { code: "validation_error", message: "Username and password are required." },
          { status: 422 },
        );
      }

      const newUser: AppUser = {
        id: users.length + 1,
        username: body.username,
        role: (body.role as AppUser["role"]) ?? "user",
        status: "active",
        theme_preference: "system",
      };

      return apiResponse(newUser);
    }),

    http.get("*/api/users/:userId", ({ params }) => {
      const userId = Number(params.userId);
      const user = users.find((u) => u.id === userId);

      if (!user) {
        return apiError({ code: "not_found", message: "User not found." }, { status: 404 });
      }

      return apiResponse(user);
    }),

    http.patch("*/api/users/:userId", async ({ params, request }) => {
      const userId = Number(params.userId);
      const body = (await request.json()) as Partial<AppUser>;
      const user = users.find((u) => u.id === userId);

      if (!user) {
        return apiError({ code: "not_found", message: "User not found." }, { status: 404 });
      }

      return apiResponse({ ...user, ...body });
    }),

    http.delete("*/api/users/:userId", ({ params: _params }) => {
      return apiResponse({ deleted: true });
    }),

    http.post("*/api/users/:userId/reset-password", async ({ params: _params, request }) => {
      const body = (await request.json()) as { password?: string };

      if (!body?.password) {
        return apiError(
          { code: "validation_error", message: "Password is required." },
          { status: 422 },
        );
      }

      return apiResponse({ success: true });
    }),
  ];
}
