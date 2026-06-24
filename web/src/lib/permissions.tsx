import { useQuery } from "@connectrpc/connect-query";
import { createContext, use, useMemo, type ReactNode } from "react";

import { me } from "@/gen/zerx/v1/auth-AuthService_connectquery";
import { getUserButtons } from "@/gen/zerx/v1/menu-MenuService_connectquery";

interface PermissionContextValue {
  roles: string[];
  can: (code: string) => boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

// PermissionProvider loads the current user's roles and granted button codes,
// exposing a can(code) check. admin always passes; otherwise the code must be in
// the granted set. While buttons load, non-admins see buttons hidden.
export function PermissionProvider({ children }: { children: ReactNode }) {
  const { data: meData } = useQuery(me);
  const { data: buttonData } = useQuery(getUserButtons);

  const userRoles = meData?.user?.roles;

  const value = useMemo<PermissionContextValue>(() => {
    const roles = userRoles ?? [];
    const codes = new Set(buttonData?.codes ?? []);
    return {
      roles,
      can: (code: string) => roles.includes("admin") || codes.has(code),
    };
  }, [userRoles, buttonData]);

  return <PermissionContext value={value}>{children}</PermissionContext>;
}

export function usePermissions(): PermissionContextValue {
  const ctx = use(PermissionContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return ctx;
}
