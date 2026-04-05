/**
 * @file 用户相关界面组件模块。
 */

import { useCallback, memo, useMemo } from "react";
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

export const UserTable = memo(function UserTable({
  users,
  onDelete,
  onToggleStatus,
  onResetPassword,
}: UserTableProps) {
  const { t } = useTranslation("users");

  const handleToggleStatus = useCallback(
    (user: UserItem) => {
      onToggleStatus(user);
    },
    [onToggleStatus],
  );

  const handleResetPassword = useCallback(
    (user: UserItem) => {
      onResetPassword(user);
    },
    [onResetPassword],
  );

  const handleDelete = useCallback(
    (user: UserItem) => {
      onDelete(user);
    },
    [onDelete],
  );

  const columns = useMemo<ColumnDef<UserItem>[]>(
    () => [
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
                  onClick={() => handleToggleStatus(user)}
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
                onClick={() => handleResetPassword(user)}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("resetPasswordAction", { username: user.username })}
              </Button>
              {user.role === "user" ? (
                <Button
                  onClick={() => handleDelete(user)}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
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
    ],
    [t, handleToggleStatus, handleResetPassword, handleDelete],
  );

  return (
    <DataTable
      columns={columns as unknown as ColumnDef<unknown, unknown>[]}
      data={users as unknown as Record<string, unknown>[]}
      emptyMessage={t("emptyState")}
      getRowId={(row: unknown) => String((row as Record<string, unknown>).id)}
    />
  );
});
