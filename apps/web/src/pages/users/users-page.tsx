/**
 * @file 用户页面模块。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { WorkspacePage } from "@/components/shared/workspace-page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type UserItem } from "@/features/users/api/users";
import {
  createUserMutationOptions,
  deleteUserMutationOptions,
  resetUserPasswordMutationOptions,
  updateUserMutationOptions,
  usersListQueryOptions,
} from "@/features/users/api/users-query";
import { CreateUserDialog } from "@/features/users/components/create-user-dialog";
import { ResetPasswordDialog } from "@/features/users/components/reset-password-dialog";
import { UserTable } from "@/features/users/components/user-table";

function summaryValue(value: number) {
  return String(value);
}

/**
 * 渲染用户页面。
 */
export function UsersPage() {
  const { t } = useTranslation("users");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserItem | null>(null);
  const [pendingResetUser, setPendingResetUser] = useState<UserItem | null>(null);

  const usersQuery = useQuery(usersListQueryOptions());
  const createMutation = useMutation(createUserMutationOptions(queryClient));
  const updateMutation = useMutation(updateUserMutationOptions(queryClient));
  const resetMutation = useMutation(resetUserPasswordMutationOptions(queryClient));
  const deleteMutation = useMutation(deleteUserMutationOptions(queryClient));

  if (usersQuery.isPending) {
    return (
      <WorkspacePage
        badge={t("workspaceBadge")}
        description={t("pageDescription")}
        main={
          <Card className="workspace-surface border-border/50">
            <CardContent className="pt-0">
              <div className="space-y-4">
                <Skeleton className="h-9 w-40 rounded-full" />
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </CardContent>
          </Card>
        }
        title={t("pageTitle")}
      />
    );
  }

  const users = usersQuery.data ?? [];
  const adminCount = users.filter((user) => user.role === "admin").length;
  const standardUserCount = users.filter((user) => user.role === "user").length;
  const disabledCount = users.filter((user) => user.status === "disabled").length;

  return (
    <>
      <WorkspacePage
        actions={
          <Button onClick={() => setDialogOpen(true)} size="sm" type="button" variant="outline">
            {t("createUserAction")}
          </Button>
        }
        aside={
          <aside aria-label={t("statsRegionLabel")} className="space-y-2.5">
            <Card className="workspace-surface-subtle border-border/50" size="sm">
              <CardHeader className="gap-1.5 pb-3">
                <CardTitle className="text-xs font-semibold tracking-tight">
                  {t("summaryAdminTitle")}
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground/68">
                  {t("summaryAdminDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold tabular-nums">{summaryValue(adminCount)}</p>
              </CardContent>
            </Card>

            <Card className="workspace-surface-subtle border-border/50" size="sm">
              <CardHeader className="gap-1.5 pb-3">
                <CardTitle className="text-xs font-semibold tracking-tight">
                  {t("summaryUserTitle")}
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground/68">
                  {t("summaryUserDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold tabular-nums">
                  {summaryValue(standardUserCount)}
                </p>
              </CardContent>
            </Card>

            <Card className="workspace-surface-subtle border-border/50" size="sm">
              <CardHeader className="gap-1.5 pb-3">
                <CardTitle className="text-xs font-semibold tracking-tight">
                  {t("summaryDisabledTitle")}
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground/68">
                  {t("summaryDisabledDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold tabular-nums">{summaryValue(disabledCount)}</p>
              </CardContent>
            </Card>
          </aside>
        }
        badge={t("workspaceBadge")}
        description={t("pageDescription")}
        main={
          <div className="space-y-3">
            <Card className="workspace-surface border-border/50">
              <CardHeader className="gap-1.5 border-b border-border/50 pb-4">
                <CardTitle className="text-sm font-semibold">{t("tableSectionTitle")}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground/72">
                  {t("tableSectionDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <UserTable
                  onDelete={setPendingDeleteUser}
                  onResetPassword={setPendingResetUser}
                  onToggleStatus={(user) =>
                    void updateMutation.mutateAsync({
                      userId: user.id,
                      input: { status: user.status === "active" ? "disabled" : "active" },
                    })
                  }
                  users={users}
                />
              </CardContent>
            </Card>
          </div>
        }
        title={t("pageTitle")}
      />

      <CreateUserDialog
        onClose={() => setDialogOpen(false)}
        onSubmit={async (input) => {
          await createMutation.mutateAsync(input);
        }}
        open={dialogOpen}
      />

      <ResetPasswordDialog
        onClose={() => setPendingResetUser(null)}
        onSubmit={async (input) => {
          if (!pendingResetUser) {
            return;
          }
          await resetMutation.mutateAsync({
            userId: pendingResetUser.id,
            password: input.newPassword,
          });
        }}
        open={pendingResetUser !== null}
        username={pendingResetUser?.username ?? ""}
      />

      <AlertDialog
        onOpenChange={(nextOpen) => !nextOpen && setPendingDeleteUser(null)}
        open={pendingDeleteUser !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialogDescription", { username: pendingDeleteUser?.username ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelAction")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDeleteUser) {
                  return;
                }

                void deleteMutation.mutateAsync(pendingDeleteUser.id);
                setPendingDeleteUser(null);
              }}
              variant="destructive"
            >
              {t("confirmDeleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
