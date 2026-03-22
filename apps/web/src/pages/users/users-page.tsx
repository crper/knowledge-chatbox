/**
 * @file 用户页面模块。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheckIcon, UserRoundIcon, UserXIcon } from "lucide-react";

import { WorkspaceMetricCard, WorkspacePage } from "@/components/shared/workspace-page";
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

  const users = usersQuery.data ?? [];
  const adminCount = users.filter((user) => user.role === "admin").length;
  const standardUserCount = users.filter((user) => user.role === "user").length;
  const disabledCount = users.filter((user) => user.status === "disabled").length;
  const summaryValue = (count: number) => (usersQuery.isPending ? "..." : String(count));

  return (
    <>
      <WorkspacePage
        actions={
          <Button onClick={() => setDialogOpen(true)} size="lg" type="button">
            {t("createUserAction")}
          </Button>
        }
        aside={
          <>
            <Card className="border-border/70 bg-card/92" size="sm">
              <CardHeader className="gap-1">
                <CardTitle>{t("operationsCardTitle")}</CardTitle>
                <CardDescription>{t("operationsCardDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
                <p>{t("operationsCardLineOne")}</p>
                <p>{t("operationsCardLineTwo")}</p>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/92" size="sm">
              <CardHeader className="gap-1">
                <CardTitle>{t("rulesCardTitle")}</CardTitle>
                <CardDescription>{t("rulesCardDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
                <p>{t("rulesCardLineOne")}</p>
                <p>{t("rulesCardLineTwo")}</p>
              </CardContent>
            </Card>
          </>
        }
        badge={t("workspaceBadge")}
        description={t("pageDescription")}
        main={
          <Card className="border-border/70 bg-card/92">
            <CardHeader className="gap-1 border-b border-border/70 pb-5">
              <CardTitle>{t("tableSectionTitle")}</CardTitle>
              <CardDescription>{t("tableSectionDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
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
        }
        metrics={
          <>
            <WorkspaceMetricCard
              icon={ShieldCheckIcon}
              label={t("summaryAdminTitle")}
              value={summaryValue(adminCount)}
            />
            <WorkspaceMetricCard
              icon={UserRoundIcon}
              label={t("summaryUserTitle")}
              value={summaryValue(standardUserCount)}
            />
            <WorkspaceMetricCard
              icon={UserXIcon}
              label={t("summaryDisabledTitle")}
              value={summaryValue(disabledCount)}
            />
          </>
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
