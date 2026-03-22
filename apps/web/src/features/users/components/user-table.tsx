/**
 * @file 用户相关界面组件模块。
 */

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import type { UserItem } from "../api/users";

type UserTableProps = {
  users: UserItem[];
  onDelete: (user: UserItem) => void;
  onToggleStatus: (user: UserItem) => void;
  onResetPassword: (user: UserItem) => void;
};

/**
 * 渲染用户表格。
 */
export function UserTable({ users, onDelete, onToggleStatus, onResetPassword }: UserTableProps) {
  const { t } = useTranslation("users");
  const columns: ColumnDef<UserItem>[] = [
    {
      accessorKey: "username",
      cell: ({ row }) => (
        <div className="space-y-1">
          <p className="font-medium">{row.original.username}</p>
          <p className="text-xs text-muted-foreground">ID {row.original.id}</p>
        </div>
      ),
      header: t("usernameColumn"),
    },
    {
      accessorKey: "role",
      cell: ({ row }) => (
        <Badge variant={row.original.role === "admin" ? "secondary" : "outline"}>
          {row.original.role === "admin" ? t("roleAdmin") : t("roleUser")}
        </Badge>
      ),
      header: t("roleColumn"),
    },
    {
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "secondary" : "destructive"}>
          {row.original.status === "active" ? t("statusActive") : t("statusDisabled")}
        </Badge>
      ),
      header: t("statusColumn"),
    },
    {
      cell: ({ row }) => {
        const user = row.original;

        return (
          <div className="flex flex-wrap justify-end gap-2">
            {user.role === "user" ? (
              <Button
                onClick={() => onToggleStatus(user)}
                size="sm"
                type="button"
                variant="outline"
              >
                {user.status === "active"
                  ? t("disableUserAction", { username: user.username })
                  : t("enableUserAction", { username: user.username })}
              </Button>
            ) : null}
            <Button
              onClick={() => onResetPassword(user)}
              size="sm"
              type="button"
              variant="secondary"
            >
              {t("resetPasswordAction", { username: user.username })}
            </Button>
            {user.role === "user" ? (
              <Button onClick={() => onDelete(user)} size="sm" type="button" variant="destructive">
                {t("deleteUserAction", { username: user.username })}
              </Button>
            ) : null}
          </div>
        );
      },
      enableSorting: false,
      header: t("actionsColumn"),
      id: "actions",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={users}
      emptyMessage={t("emptyState")}
      getRowId={(row) => String(row.id)}
    />
  );
}
