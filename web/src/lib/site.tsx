import { useQuery } from "@connectrpc/connect-query";
import { createContext, use, useEffect, type ReactNode } from "react";

import { getSiteSettings } from "@/gen/zerx/v1/site-SiteSettingsService_connectquery";

interface SiteSettingsValue {
  name: string;
  logo: string;
  domain: string;
}

const SiteContext = createContext<SiteSettingsValue | null>(null);

// SiteProvider loads site-wide settings (name/logo/domain) and applies the name
// to the document title and the logo to the favicon, so a saved configuration
// is reflected in the browser tab. Children consume the values via useSite.
export function SiteProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery(getSiteSettings, {});
  const name = data?.name ?? "";
  const logo = data?.logo ?? "";
  const domain = data?.domain ?? "";

  useEffect(() => {
    if (name) document.title = name;
  }, [name]);

  useEffect(() => {
    if (!logo) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = logo;
  }, [logo]);

  return <SiteContext value={{ name, logo, domain }}>{children}</SiteContext>;
}

export function useSite(): SiteSettingsValue {
  const ctx = use(SiteContext);
  if (!ctx) {
    throw new Error("useSite must be used within a SiteProvider");
  }
  return ctx;
}
