import { useMutation, useQuery } from "@connectrpc/connect-query";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { LogOutIcon, PanelLeftIcon } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  logout,
  me,
  revokeSession,
} from "@/gen/zerx/v1/auth-AuthService_connectquery";
import type { Menu } from "@/gen/zerx/v1/menu_pb";
import { getUserMenus } from "@/gen/zerx/v1/menu-MenuService_connectquery";
import { auth, getSessionId } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { menuIcon } from "@/lib/menu-icons";
import { queryClient } from "@/lib/query-client";
import { PermissionProvider } from "@/lib/permissions";
import { SiteProvider, useSite } from "@/lib/site";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated()) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <PermissionProvider>
      <SiteProvider>
        <AuthedShell />
      </SiteProvider>
    </PermissionProvider>
  );
}

function AuthedShell() {
  const { t } = useI18n();
  const site = useSite();
  const [collapsed, setCollapsed] = useState(false);
  const { data, isPending } = useQuery(getUserMenus);
  const menus = data?.menus ?? [];

  return (
    <div className="flex h-svh w-full overflow-hidden">
      <aside
        className={cn(
          "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          {site.logo ? (
            <img src={site.logo} alt="" className="size-7 shrink-0 rounded object-contain" />
          ) : (
            <BrandLogo className="size-7" />
          )}
          {!collapsed && (
            <span className="truncate font-semibold text-sidebar-accent-foreground">
              {site.name || t("app.name")}
            </span>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {isPending ? (
            <div className="flex flex-col gap-2 p-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            menus.map((menu) => (
              <SidebarNode key={String(menu.id)} menu={menu} collapsed={collapsed} />
            ))
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <Header collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} menus={menus} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarNode({ menu, collapsed }: { menu: Menu; collapsed: boolean }) {
  const { t } = useI18n();
  const Icon = menuIcon(menu.icon);

  // Group heading (no path): render a label + its children.
  if (menu.path === "") {
    return (
      <div className="flex flex-col gap-1">
        {!collapsed && (
          <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
            {t(menu.title)}
          </p>
        )}
        {menu.children.map((child) => (
          <SidebarNode key={String(child.id)} menu={child} collapsed={collapsed} />
        ))}
      </div>
    );
  }

  return (
    <Link
      to={menu.path}
      title={t(menu.title)}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-primary",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{t(menu.title)}</span>}
    </Link>
  );
}

function findMenuTitle(menus: Menu[], pathname: string): string | undefined {
  for (const m of menus) {
    if (m.path !== "" && pathname.startsWith(m.path)) {
      return m.title;
    }
    const child = findMenuTitle(m.children, pathname);
    if (child) {
      return child;
    }
  }
  return undefined;
}

function Header({
  collapsed,
  onToggle,
  menus,
}: {
  collapsed: boolean;
  onToggle: () => void;
  menus: Menu[];
}) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const { data } = useQuery(me);
  const user = data?.user;
  const revokeMutation = useMutation(revokeSession);
  const logoutMutation = useMutation(logout);

  const titleKey = findMenuTitle(menus, location.pathname);
  const title = titleKey ? t(titleKey) : t("app.name");
  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  const handleLogout = async () => {
    const sid = getSessionId();
    if (sid) {
      try {
        await revokeMutation.mutateAsync({ id: sid });
      } catch {
        // ignore: log out locally regardless.
      }
    }
    auth.clearTokens();
    queryClient.clear();
    void navigate({ to: "/login" });
  };

  const handleLogoutAll = async () => {
    try {
      await logoutMutation.mutateAsync({});
    } catch {
      // ignore
    }
    auth.clearTokens();
    queryClient.clear();
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
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOutIcon className="size-4" />
              {t("common.signOut")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleLogoutAll()}>
              <LogOutIcon className="size-4" />
              {t("common.signOutAll")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
