import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "zh";

const STORAGE_KEY = "zerx.locale";

function getStoredLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") {
    return stored;
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const en = {
  app: { name: "zerxLabKit", tagline: "Full-stack admin starter" },
  common: {
    signIn: "Sign in",
    signOut: "Sign out",
    register: "Register",
    email: "Email",
    password: "Password",
    name: "Name",
    role: "Role",
    save: "Save",
    cancel: "Cancel",
    create: "Create",
    delete: "Delete",
    edit: "Edit",
    search: "Search",
    actions: "Actions",
    id: "ID",
    created: "Created",
    loading: "Loading…",
  },
  nav: { dashboard: "Dashboard", users: "Users", management: "Management" },
  login: {
    title: "Welcome back",
    subtitle: "Sign in to continue",
    noAccount: "Don't have an account?",
    registerLink: "Create one",
    submitting: "Signing in…",
    failed: "Login failed",
  },
  register: {
    title: "Create your account",
    subtitle: "The first account becomes the administrator",
    haveAccount: "Already have an account?",
    loginLink: "Sign in",
    submitting: "Creating…",
    failed: "Registration failed",
  },
  dashboard: {
    title: "Dashboard",
    welcome: "Welcome back, {name}.",
    currentUser: "Current user",
    accountDesc: "Your authenticated account.",
    totalUsers: "Total users",
    yourRole: "Your role",
    accountId: "Account ID",
  },
  users: {
    title: "Users",
    add: "Add user",
    searchPlaceholder: "Search by name…",
    total: "{count} total",
    pageOf: "Page {page} of {pages}",
    previous: "Previous",
    next: "Next",
    noUsers: "No users found.",
    addTitle: "Add user",
    addDesc: "Create a new account.",
    editTitle: "Edit user",
    deleteTitle: "Delete user",
    deleteDesc: "Permanently remove {email}? This action cannot be undone.",
    createdToast: "User created",
    updatedToast: "User updated",
    deletedToast: "User deleted",
  },
  roles: { admin: "Admin", user: "User" },
  theme: { toggle: "Toggle theme" },
  validation: {
    email: "Enter a valid email",
    passwordMin: "Password must be at least 8 characters",
    nameRequired: "Name is required",
  },
};

const zh: typeof en = {
  app: { name: "zerxLabKit", tagline: "全栈后台脚手架" },
  common: {
    signIn: "登录",
    signOut: "退出登录",
    register: "注册",
    email: "邮箱",
    password: "密码",
    name: "名称",
    role: "角色",
    save: "保存",
    cancel: "取消",
    create: "创建",
    delete: "删除",
    edit: "编辑",
    search: "搜索",
    actions: "操作",
    id: "ID",
    created: "创建时间",
    loading: "加载中…",
  },
  nav: { dashboard: "仪表盘", users: "用户管理", management: "系统管理" },
  login: {
    title: "欢迎回来",
    subtitle: "登录以继续",
    noAccount: "还没有账号？",
    registerLink: "立即注册",
    submitting: "登录中…",
    failed: "登录失败",
  },
  register: {
    title: "创建账号",
    subtitle: "首个注册的账号将成为管理员",
    haveAccount: "已有账号？",
    loginLink: "去登录",
    submitting: "创建中…",
    failed: "注册失败",
  },
  dashboard: {
    title: "仪表盘",
    welcome: "欢迎回来，{name}。",
    currentUser: "当前用户",
    accountDesc: "你已认证的账号信息。",
    totalUsers: "用户总数",
    yourRole: "你的角色",
    accountId: "账号 ID",
  },
  users: {
    title: "用户管理",
    add: "新增用户",
    searchPlaceholder: "按名称搜索…",
    total: "共 {count} 条",
    pageOf: "第 {page} / {pages} 页",
    previous: "上一页",
    next: "下一页",
    noUsers: "暂无用户。",
    addTitle: "新增用户",
    addDesc: "创建一个新账号。",
    editTitle: "编辑用户",
    deleteTitle: "删除用户",
    deleteDesc: "确认永久删除 {email}？该操作不可撤销。",
    createdToast: "用户已创建",
    updatedToast: "用户已更新",
    deletedToast: "用户已删除",
  },
  roles: { admin: "管理员", user: "普通用户" },
  theme: { toggle: "切换主题" },
  validation: {
    email: "请输入有效的邮箱",
    passwordMin: "密码至少 8 位",
    nameRequired: "名称不能为空",
  },
};

const dictionaries: Record<Locale, typeof en> = { en, zh };

function resolve(dict: typeof en, path: string): string | undefined {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dict) as string | undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getStoredLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t: TranslateFn = (key, params) =>
      interpolate(resolve(dictionaries[locale], key) ?? resolve(en, key) ?? key, params);
    return {
      locale,
      setLocale,
      toggleLocale: () => setLocale((prev) => (prev === "en" ? "zh" : "en")),
      t,
    };
  }, [locale]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  const ctx = use(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
