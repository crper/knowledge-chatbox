import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { useSessionStore } from "@/lib/auth/session-store";
import { QueryProvider } from "@/providers/query-provider";
import { jsonResponse } from "@/test/http";
import { UsersPage } from "./users-page";

function buildUsersFetch(
  role: "admin" | "user" = "admin",
  options?: {
    createUserSucceeds?: boolean;
    resetPasswordSucceeds?: boolean;
  },
) {
  const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
    if (input.endsWith("/api/auth/me")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: {
            id: 1,
            username: role,
            role,
            status: "active",
            theme_preference: "system",
          },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/users") && init?.method === "POST") {
      if (options?.createUserSucceeds === false) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              data: null,
              error: { code: "conflict", message: "用户名已存在" },
            },
            { status: 409 },
          ),
        );
      }

      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { id: 3, username: "new-user", status: "active", role: "user" },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/users/2/reset-password")) {
      if (options?.resetPasswordSucceeds === false) {
        return Promise.resolve(
          jsonResponse(
            {
              success: false,
              data: null,
              error: { code: "validation_error", message: "密码长度不足" },
            },
            { status: 400 },
          ),
        );
      }

      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { id: 2, username: "bob", status: "active", role: "user" },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/users/2")) {
      if (init?.method === "DELETE") {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: { status: "deleted" },
            error: null,
          }),
        );
      }

      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { id: 2, username: "bob", status: "disabled", role: "user" },
          error: null,
        }),
      );
    }

    if (input.endsWith("/api/users")) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: [
            { id: 1, username: "admin", status: "active", role: "admin" },
            { id: 2, username: "bob", status: "active", role: "user" },
          ],
          error: null,
        }),
      );
    }

    return Promise.resolve(jsonResponse({ success: true, data: [], error: null }));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("UsersPage", () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it("renders user list and create entry for admin", async () => {
    buildUsersFetch();

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
    const fetchMock = buildUsersFetch();

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
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/users$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("validates create user inputs before submitting", async () => {
    const fetchMock = buildUsersFetch();

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "创建用户" }));
    fireEvent.click(screen.getByRole("button", { name: "提交创建" }));

    expect(await screen.findByText("请输入用户名和初始密码。")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/users$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps create user inputs after submit failure", async () => {
    buildUsersFetch("admin", { createUserSucceeds: false });

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
    const fetchMock = buildUsersFetch();

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "禁用 bob" }));
    fireEvent.click(screen.getByRole("button", { name: "重置密码 bob" }));

    expect(await screen.findByText("重置用户密码")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/users\/2\/reset-password$/),
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new-secret-456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/users\/2$/),
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/users\/2\/reset-password$/),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("validates reset password input before submitting", async () => {
    const fetchMock = buildUsersFetch();

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "重置密码 bob" }));
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    expect(await screen.findByText("请输入至少 8 位的新密码。")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/users\/2\/reset-password$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps reset password input after submit failure", async () => {
    buildUsersFetch("admin", { resetPasswordSucceeds: false });

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
    const fetchMock = buildUsersFetch();

    render(
      <QueryProvider>
        <UsersPage />
      </QueryProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "删除 bob" }));

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/users\/2$/),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(await screen.findByText("确认删除用户？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/users\/2$/),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
