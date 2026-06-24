import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";

import { me } from "@/gen/zerx/v1/auth-AuthService_connectquery";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isPending } = useQuery(me);
  const user = data?.user;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current user</CardTitle>
          <CardDescription>Your authenticated account.</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending || !user ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{user.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{user.email}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd>
                <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                  {user.role}
                </Badge>
              </dd>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
