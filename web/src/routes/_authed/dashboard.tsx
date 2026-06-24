import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { ActivityIcon, HashIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import type { ComponentType } from "react";

import { me } from "@/gen/zerx/v1/auth-AuthService_connectquery";
import { getDashboardStats } from "@/gen/zerx/v1/dashboard-DashboardService_connectquery";
import type { TimePoint } from "@/gen/zerx/v1/dashboard_pb";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  CHART_COLORS,
  ChartContainer,
  ChartTooltipContent,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "@/components/ui/chart";
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

function timePointsToData(points: TimePoint[]) {
  return points.map((p) => ({ date: p.date, value: Number(p.value) }));
}

function DashboardPage() {
  const { t } = useI18n();
  const { data: meData, isPending } = useQuery(me);

  const { data: stats, error: statsError } = useQuery(getDashboardStats, {});
  const hasStats = !!stats && !statsError;

  const user = meData?.user;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">
          {t("dashboard.welcome", { name: user?.name ?? "" })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={UsersIcon}
          label={t("dashboard.totalUsers")}
          value={hasStats ? Number(stats.totalUsers) : <Skeleton className="h-7 w-10" />}
        />
        <StatCard
          icon={ShieldCheckIcon}
          label={t("dashboard.totalRoles")}
          value={hasStats ? Number(stats.totalRoles) : <Skeleton className="h-7 w-10" />}
        />
        <StatCard
          icon={ActivityIcon}
          label={t("dashboard.activeSessions")}
          value={hasStats ? Number(stats.activeSessions) : <Skeleton className="h-7 w-10" />}
        />
        <StatCard
          icon={HashIcon}
          label={t("dashboard.todayLogins")}
          value={hasStats ? Number(stats.todayLogins) : <Skeleton className="h-7 w-10" />}
        />
      </div>

      {/* Current user card */}
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
              <dt className="text-muted-foreground">{t("common.roles")}</dt>
              <dd className="flex flex-wrap gap-1">
                {user.roles.length > 0
                  ? user.roles.map((r) => (
                      <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                        {t(`roles.${r}`) !== `roles.${r}` ? t(`roles.${r}`) : r}
                      </Badge>
                    ))
                  : <span className="text-muted-foreground">—</span>
                }
              </dd>
              <dt className="text-muted-foreground">{t("dashboard.accountId")}</dt>
              <dd className="font-mono">{String(user.id)}</dd>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      {statsError ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.noPermission")}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* User growth */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.userGrowth")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!hasStats ? (
                <Skeleton className="h-52 w-full" />
              ) : (
                <ChartContainer>
                  <LineChart data={timePointsToData(stats.userGrowth)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltipContent />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={t("dashboard.totalUsers")}
                      stroke={CHART_COLORS.primary}
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Login success vs failure */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.loginTrend")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!hasStats ? (
                <Skeleton className="h-52 w-full" />
              ) : (() => {
                // Merge success and failure by date
                const successMap = new Map(stats.loginSuccess.map((p) => [p.date, Number(p.value)]));
                const failureMap = new Map(stats.loginFailure.map((p) => [p.date, Number(p.value)]));
                const dates = Array.from(new Set([...successMap.keys(), ...failureMap.keys()])).sort();
                const data = dates.map((d) => ({
                  date: d,
                  success: successMap.get(d) ?? 0,
                  failure: failureMap.get(d) ?? 0,
                }));
                return (
                  <ChartContainer>
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ChartTooltipContent />
                      <Bar dataKey="success" name={t("dashboard.loginSuccess")} fill={CHART_COLORS.success} />
                      <Bar dataKey="failure" name={t("dashboard.loginFailure")} fill={CHART_COLORS.danger} />
                    </BarChart>
                  </ChartContainer>
                );
              })()}
            </CardContent>
          </Card>

          {/* Operation count */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.operationTrend")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!hasStats ? (
                <Skeleton className="h-52 w-full" />
              ) : (
                <ChartContainer>
                  <BarChart data={timePointsToData(stats.operationCount)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltipContent />
                    <Bar
                      dataKey="value"
                      name={t("dashboard.operations")}
                      fill={CHART_COLORS.primary}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
