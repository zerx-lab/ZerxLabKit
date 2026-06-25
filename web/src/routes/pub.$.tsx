import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, type ComponentType, useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { listPublicPages } from "@/gen/zerx/v1/plugin-PluginService_connectquery";
import { useI18n } from "@/lib/i18n";

// Public (anonymous) splat route for plugin front-end pages served at /pub/...
// Unlike /_authed/p/$, this route is NOT under the authed layout: no login is
// required. Pages are resolved from the anonymous ListPublicPages endpoint,
// which only returns pages of ENABLED plugins (a disabled plugin's public page
// 404s here). The component is loaded from the same plugin-components glob.
export const Route = createFileRoute("/pub/$")({
  component: PublicPage,
});

const modules = import.meta.glob("/src/plugin-components/**/*.tsx");

function PublicPage() {
  const { _splat } = Route.useParams();
  const { t } = useI18n();
  const { data, isPending } = useQuery(listPublicPages, {});

  const path = `/pub/${_splat ?? ""}`;
  const page = useMemo(
    () => (data?.pages ?? []).find((p) => p.path === path),
    [data, path],
  );

  const Lazy = useMemo(() => {
    if (!page?.component) {
      return undefined;
    }
    const loader = modules[`/src/plugin-components/${page.component}.tsx`];
    if (!loader) {
      return undefined;
    }
    return lazy(loader as () => Promise<{ default: ComponentType }>);
  }, [page]);

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-64 w-full max-w-3xl" />
      </div>
    );
  }

  if (!Lazy) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">{t("common.notFound")}</p>
        <p className="text-sm">{path}</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <Skeleton className="h-64 w-full max-w-3xl" />
        </div>
      }
    >
      <Lazy />
    </Suspense>
  );
}
