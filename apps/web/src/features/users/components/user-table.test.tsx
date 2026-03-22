import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import { i18n } from "../../../i18n";
import type { UserItem } from "../api/users";
import { UserTable } from "./user-table";

const users: UserItem[] = [
  { id: 2, username: "bob", role: "user", status: "active" },
  { id: 1, username: "admin", role: "admin", status: "active" },
];

describe("UserTable", () => {
  it("sorts rows by username when the header is clicked", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <UserTable
          onDelete={() => {}}
          onResetPassword={() => {}}
          onToggleStatus={() => {}}
          users={users}
        />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "用户名" }));

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("admin")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("bob")).toBeInTheDocument();
  });
});
