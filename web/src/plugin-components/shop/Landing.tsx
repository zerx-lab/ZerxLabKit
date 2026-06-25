import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

// Landing is the shop plugin's anonymous public page, served at /pub/shop via
// the public splat route (no login). It demonstrates a public-facing plugin
// front-end: a marketing/storefront page reachable without authentication.
export default function Landing() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{t("plg.shop.landingTitle")}</h1>
      <p className="max-w-xl text-muted-foreground">{t("plg.shop.landingSubtitle")}</p>
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/login">{t("plg.shop.landingCta")}</Link>
        </Button>
      </div>
    </div>
  );
}
