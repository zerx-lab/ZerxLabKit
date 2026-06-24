import { useQuery } from "@connectrpc/connect-query";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import {
  LayoutDashboardIcon,
  LogOutIcon,
  PanelLeftIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { me } from "@/gen/zerx/v1/auth-AuthService_connectquery";
import { auth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated()) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: AuthedLayout,
});

const navItems = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboardIcon },
  { to: "/users", labelKey: "nav.users", icon: UsersIcon },
] as const;

function AuthedLayout() {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-svh w-full overflow-hidden">
      <aside
        className={cn(
          "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="size-7 shrink-0 rounded-md bg-primary" />
          {!collapsed && (
            <span className="truncate font-semibold text-sidebar-accent-foreground">
              {t("app.name")}
            </span>
          )}
        </div>
        {!collapsed && (
          <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
            {t("nav.management")}
          </p>
        )}
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              title={t(item.labelKey)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                "data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-primary",
                collapsed && "justify-center px-0",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <Header collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Header({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const { data } = useQuery(me);
  const user = data?.user;

  const active = navItems.find((item) => location.pathname.startsWith(item.to));
  const title = active ? t(active.labelKey) : t("app.name");
  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  const handleLogout = () => {
    auth.clearTokens();
    void navigate({ to: "/login" });
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Toggle sidebar">
        <PanelLeftIcon className="size-4" />
      </Button>
      <span className="text-sm font-medium">{title}</span>
      {collapsed ? <span className="sr-only">collapsed</span> : null}

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <LanguageSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initial}
              </span>
              {user ? (
                <span className="hidden max-w-32 truncate text-sm sm:inline">
                  {user.name || user.email}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="truncate font-medium">{user?.name}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOutIcon className="size-4" />
              {t("common.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
