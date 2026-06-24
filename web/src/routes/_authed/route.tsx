import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated()) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.clearTokens();
    void navigate({ to: "/login" });
  };

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4">
            <Link to="/dashboard" className="font-semibold">
              zerxLabKit
            </Link>
            <Link
              to="/dashboard"
              className="text-muted-foreground text-sm [&.active]:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              to="/users"
              className="text-muted-foreground text-sm [&.active]:text-foreground"
            >
              Users
            </Link>
          </nav>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
