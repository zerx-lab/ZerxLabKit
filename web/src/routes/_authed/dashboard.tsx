import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { HashIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import type { ComponentType } from "react";

import { me } from "@/gen/zerx/v1/auth-AuthService_connectquery";
import { listUsers } from "@/gen/zerx/v1/user-UserService_connectquery";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { t } = useI18n();
  const { data: meData, isPending } = useQuery(me);
  const { data: usersData } = useQuery(listUsers, {});

  const user = meData?.user;
  const total = usersData ? Number(usersData.total) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">
          {t("dashboard.welcome", { name: user?.name ?? "" })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={UsersIcon}
          label={t("dashboard.totalUsers")}
          value={total ?? <Skeleton className="h-7 w-10" />}
        />
        <StatCard
          icon={ShieldCheckIcon}
          label={t("dashboard.yourRole")}
          value={user ? t(`roles.${user.role}`) : <Skeleton className="h-7 w-16" />}
        />
        <StatCard
          icon={HashIcon}
          label={t("dashboard.accountId")}
          value={user ? String(user.id) : <Skeleton className="h-7 w-10" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.currentUser")}</CardTitle>
          <CardDescription>{t("dashboard.accountDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending || !user ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">{t("common.name")}</dt>
              <dd>{user.name}</dd>
              <dt className="text-muted-foreground">{t("common.email")}</dt>
              <dd>{user.email}</dd>
              <dt className="text-muted-foreground">{t("common.role")}</dt>
              <dd>
                <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                  {t(`roles.${user.role}`)}
                </Badge>
              </dd>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
