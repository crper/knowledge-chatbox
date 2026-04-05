import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http } from "msw";

import { useSessionStore } from "@/lib/auth/session-store";
import { QueryProvider } from "@/providers/query-provider";
import { buildAppUser } from "@/test/fixtures/app";
import { apiResponse, apiError, createTestServer, overrideHandler } from "@/test/msw";
import { UsersPage } from "./users-page";

describe("UsersPage", () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    createTestServer({
      user: buildAppUser("admin"),
      authenticated: true,
      users: [
        { id: 1, username: "admin", status: "active", role: "admin", theme_preference: "system" },
        { id: 2, username: "bob", status: "active", role: "user", theme_preference: "system" },
      ],
    });
  });

  it("renders user list and create entry for admin", async () => {
    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    expect(await screen.findByRole("button", { name: "创建用户" })).toBeInTheDocument();
    expect(screen.getByText("管理员账号")).toBeInTheDocument();
    expect(screen.getByText("普通账号")).toBeInTheDocument();
    expect((await screen.findAllByText("admin")).length).toBeGreaterThan(0);
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "禁用 admin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 admin" })).not.toBeInTheDocument();
  });

  it("creates a user", async () => {
    let createUserCalled = false;

    overrideHandler(
      http.post("*/api/users", () => {
        createUserCalled = true;
        return apiResponse({
          id: 3,
          username: "new-user",
          status: "active",
          role: "user",
          theme_preference: "system",
        });
      }),
    );

    overrideHandler(
      http.get("*/api/users", () => {
        if (createUserCalled) {
          return apiResponse([
            {
              id: 1,
              username: "admin",
              status: "active",
              role: "admin",
              theme_preference: "system",
            },
            { id: 2, username: "bob", status: "active", role: "user", theme_preference: "system" },
            {
              id: 3,
              username: "new-user",
              status: "active",
              role: "user",
              theme_preference: "system",
            },
          ]);
        }
        return apiResponse([
          { id: 1, username: "admin", status: "active", role: "admin", theme_preference: "system" },
          { id: 2, username: "bob", status: "active", role: "user", theme_preference: "system" },
        ]);
      }),
    );

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "创建用户" }));
    fireEvent.change(screen.getByLabelText("新用户名"), { target: { value: "new-user" } });
    fireEvent.change(screen.getByLabelText("初始密码"), { target: { value: "secret-123" } });
    fireEvent.click(screen.getByRole("button", { name: "提交创建" }));

    await waitFor(() => {
      expect(screen.getByText("new-user")).toBeInTheDocument();
    });
  });

  it("validates create user inputs before submitting", async () => {
    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "创建用户" }));
    fireEvent.click(screen.getByRole("button", { name: "提交创建" }));

    expect(await screen.findByText("请输入用户名和初始密码。")).toBeInTheDocument();
  });

  it("keeps create-user validation visible until the corrected password field blurs", async () => {
    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "创建用户" }));
    fireEvent.click(screen.getByRole("button", { name: "提交创建" }));

    expect(await screen.findByText("请输入用户名和初始密码。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新用户名"), { target: { value: "new-user" } });
    fireEvent.blur(screen.getByLabelText("新用户名"));
    expect(screen.getByText("请输入用户名和初始密码。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("初始密码"), { target: { value: "secret-123" } });
    expect(screen.getByText("请输入用户名和初始密码。")).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("初始密码"));

    await waitFor(() => {
      expect(screen.queryByText("请输入用户名和初始密码。")).not.toBeInTheDocument();
    });
  });

  it("keeps create user inputs after submit failure", async () => {
    overrideHandler(
      http.post("*/api/users", () => {
        return apiError({ code: "conflict", message: "用户名已存在" }, { status: 409 });
      }),
    );

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "创建用户" }));
    fireEvent.change(screen.getByLabelText("新用户名"), { target: { value: "new-user" } });
    fireEvent.change(screen.getByLabelText("初始密码"), { target: { value: "secret-123" } });
    fireEvent.click(screen.getByRole("button", { name: "提交创建" }));

    await waitFor(() => {
      expect(screen.getByLabelText("新用户名")).toHaveValue("new-user");
      expect(screen.getByLabelText("初始密码")).toHaveValue("secret-123");
      expect(screen.getByRole("button", { name: "提交创建" })).toBeEnabled();
    });
  });

  it("disables a user and opens reset password dialog", async () => {
    overrideHandler(
      http.patch("*/api/users/2", () => {
        return apiResponse({
          id: 2,
          username: "bob",
          status: "disabled",
          role: "user",
          theme_preference: "system",
        });
      }),
    );

    overrideHandler(
      http.post("*/api/users/2/reset-password", () => {
        return apiResponse({
          id: 2,
          username: "bob",
          status: "disabled",
          role: "user",
          theme_preference: "system",
        });
      }),
    );

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "禁用 bob" }));
    fireEvent.click(screen.getByRole("button", { name: "重置密码 bob" }));

    expect(await screen.findByText("重置用户密码")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new-secret-456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    await waitFor(() => {
      expect(screen.queryByText("重置用户密码")).not.toBeInTheDocument();
    });
  });

  it("validates reset password input before submitting", async () => {
    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "重置密码 bob" }));
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    expect(await screen.findByText("请输入至少 8 位的新密码。")).toBeInTheDocument();
  });

  it("keeps reset-password validation visible until the corrected password field blurs", async () => {
    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "重置密码 bob" }));
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    expect(await screen.findByText("请输入至少 8 位的新密码。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new-secret-456" },
    });

    expect(screen.getByText("请输入至少 8 位的新密码。")).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("新密码"));

    await waitFor(() => {
      expect(screen.queryByText("请输入至少 8 位的新密码。")).not.toBeInTheDocument();
    });
  });

  it("keeps reset password input after submit failure", async () => {
    overrideHandler(
      http.post("*/api/users/2/reset-password", () => {
        return apiError({ code: "validation_error", message: "密码长度不足" }, { status: 400 });
      }),
    );

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "重置密码 bob" }));
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "short-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    await waitFor(() => {
      expect(screen.getByLabelText("新密码")).toHaveValue("short-123");
      expect(screen.getByRole("button", { name: "确认重置" })).toBeEnabled();
    });
  });

  it("asks for confirmation before deleting a regular user", async () => {
    overrideHandler(
      http.delete("*/api/users/2", () => {
        return apiResponse({ deleted: true });
      }),
    );

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "删除 bob" }));

    expect(await screen.findByText("确认删除用户？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(screen.queryByText("确认删除用户？")).not.toBeInTheDocument();
    });
  });
});
