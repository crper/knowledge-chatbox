import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { i18n } from "@/i18n";
import { ApiRequestError } from "@/lib/api/client";
import { AppProviders } from "@/providers/app-providers";
import { ChangePasswordDialog } from "./change-password-dialog";

describe("ChangePasswordDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("shows a specific validation error when the current password is missing", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <AppProviders>
        <ChangePasswordDialog open onClose={onClose} onSubmit={onSubmit} />
      </AppProviders>,
    );

    fireEvent.change(await screen.findByLabelText("新密码"), {
      target: { value: "new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(await screen.findByText("请输入当前密码。")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a localized current-password error and re-localizes when the language changes", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiRequestError("Current password is incorrect.", {
        code: "invalid_credentials",
        status: 401,
      }),
    );

    render(
      <AppProviders>
        <ChangePasswordDialog open onClose={onClose} onSubmit={onSubmit} />
      </AppProviders>,
    );

    fireEvent.change(await screen.findByLabelText("当前密码"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(await screen.findByText("当前密码不正确，请重试。")).toBeInTheDocument();

    await i18n.changeLanguage("en");

    await waitFor(() => {
      expect(screen.getByText("Current password is incorrect.")).toBeInTheDocument();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password-123",
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps local validation visible until the user blurs the corrected field", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <AppProviders>
        <ChangePasswordDialog open onClose={onClose} onSubmit={onSubmit} />
      </AppProviders>,
    );

    fireEvent.change(await screen.findByLabelText("新密码"), {
      target: { value: "new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(await screen.findByText("请输入当前密码。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "old-password" },
    });

    expect(screen.getByText("请输入当前密码。")).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("当前密码"));

    await waitFor(() => {
      expect(screen.queryByText("请输入当前密码。")).not.toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
