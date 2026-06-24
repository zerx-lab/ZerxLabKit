import type { ReactNode } from "react";

import { usePermissions } from "@/lib/permissions";

// Can renders its children only when the current user holds the given button
// permission code. Button permissions are a UX affordance only; the real
// authorization is enforced server-side by Casbin.
export function Can({ code, children }: { code: string; children: ReactNode }) {
  const { can } = usePermissions();
  if (!can(code)) {
    return null;
  }
  return <>{children}</>;
}
