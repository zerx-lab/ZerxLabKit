import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";

import { en } from "./locales/en";
import { zh } from "./locales/zh";

export type Locale = "en" | "zh";

const STORAGE_KEY = "zerx.locale";

// Static dictionaries, one module per locale (locales/<locale>.ts). `en` is the
// canonical shape; `zh` is typed `typeof en` so the two stay key-for-key in sync.
const locales: Record<Locale, typeof en> = { en, zh };

function getStoredLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") {
    return stored;
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

// Plugin translations are self-contained: each plugin ships an i18n module at
// web/src/plugin-components/<name>/i18n.ts with a default export
// `{ en: {...}, zh: {...} }`. We collect them at build time with the same
// import.meta.glob mechanism the plugin page loader (p.$.tsx) uses for
// components, and merge each plugin under the `plg.<name>` namespace. This way a
// ZIP-installed plugin's translations are picked up on rebuild with no edit to
// this file and no installer change — the plugin's i18n.ts is unpacked into its
// plugin-components/<name>/ dir and glob-collected here automatically.
type PluginLocaleEntry = Partial<Record<Locale, Record<string, unknown>>>;

const pluginI18nModules = import.meta.glob<{ default: PluginLocaleEntry }>(
  "/src/plugin-components/**/i18n.ts",
  { eager: true },
);

// pluginNamespaces[locale] is the `plg` object: { <name>: { ...keys } }.
const pluginNamespaces: Record<Locale, Record<string, Record<string, unknown>>> = {
  en: {},
  zh: {},
};

for (const [path, mod] of Object.entries(pluginI18nModules)) {
  // path is e.g. "/src/plugin-components/shop/i18n.ts" -> name "shop".
  const name = path.split("/").at(-2);
  if (!name) continue;
  const entry = mod.default;
  for (const locale of ["en", "zh"] as const) {
    const table = entry?.[locale];
    if (table) {
      pluginNamespaces[locale][name] = table;
    }
  }
}

// Augmented dictionary type: the static `en`/`zh` shape plus the dynamic `plg`
// namespace populated from plugins.
type Dictionary = typeof en & { plg: Record<string, Record<string, unknown>> };

const dictionaries: Record<Locale, Dictionary> = {
  en: { ...locales.en, plg: pluginNamespaces.en },
  zh: { ...locales.zh, plg: pluginNamespaces.zh },
};

function resolve(dict: Dictionary, path: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return path.split(".").reduce<any>((obj, key) => obj?.[key], dict) as string | undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t: TranslateFn = useMemo(
    () => (key, params) => {
      const dict = dictionaries[locale];
      const raw = resolve(dict, key);
      if (typeof raw !== "string") return key;
      return interpolate(raw, params);
    },
    [locale],
  );

  return <I18nContext value={{ locale, setLocale, t }}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  const ctx = use(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
