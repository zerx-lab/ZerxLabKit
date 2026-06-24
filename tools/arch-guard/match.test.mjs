import { test } from "node:test";
import assert from "node:assert/strict";
import { matchContent, globToRegExp, extractFromPatch } from "./match.mjs";

const CWD = "C:/repo";
const names = (hits) => hits.map((h) => h.name);

test("i18n: 坏样本(相对路径)命中", () => {
  const hits = matchContent({
    toolName: "edit",
    filePath: "web/src/routes/x.tsx",
    content: '<button>提交</button>',
    cwd: CWD,
  });
  assert.ok(names(hits).includes("arch-i18n-no-hardcoded-cjk"));
});

test("i18n: 好样本(t(key))不命中", () => {
  const hits = matchContent({
    toolName: "edit",
    filePath: "web/src/routes/x.tsx",
    content: '<button>{t("submit")}</button>',
    cwd: CWD,
  });
  assert.ok(!names(hits).includes("arch-i18n-no-hardcoded-cjk"));
});

test("i18n: lib 字典(错目录)不命中", () => {
  const hits = matchContent({
    toolName: "edit",
    filePath: "web/src/lib/i18n.tsx",
    content: "const zh = { common: { save: '保存' } };",
    cwd: CWD,
  });
  assert.ok(!names(hits).includes("arch-i18n-no-hardcoded-cjk"));
});

test("i18n: 绝对路径坏样本命中(PlanReview P1 回归)", () => {
  const hits = matchContent({
    toolName: "write",
    filePath: "C:/repo/web/src/routes/x.tsx",
    content: "<b>提交</b>",
    cwd: CWD,
  });
  assert.ok(names(hits).includes("arch-i18n-no-hardcoded-cjk"));
});

test("requirerole: service 坏样本命中", () => {
  const hits = matchContent({
    toolName: "edit",
    filePath: "internal/service/x_service.go",
    content: 'auth.RequireRole(ctx, "admin")',
    cwd: CWD,
  });
  assert.ok(names(hits).includes("arch-no-requirerole-in-service"));
});

test("requirerole: server(错目录)不命中", () => {
  const hits = matchContent({
    toolName: "edit",
    filePath: "internal/server/x.go",
    content: "RequireRole something",
    cwd: CWD,
  });
  assert.ok(!names(hits).includes("arch-no-requirerole-in-service"));
});

test("requirerole: service 子目录(** 覆盖)命中", () => {
  const hits = matchContent({
    toolName: "edit",
    filePath: "internal/service/sub/y.go",
    content: "auth.RequireRole(ctx)",
    cwd: CWD,
  });
  assert.ok(names(hits).includes("arch-no-requirerole-in-service"));
});

test("react-query: cacheTime 命中,gcTime 不命中", () => {
  const bad = matchContent({ toolName: "edit", filePath: "web/src/lib/q.ts", content: "{ cacheTime: 5 }", cwd: CWD });
  assert.ok(names(bad).includes("arch-react-query-v5-naming"));
  const good = matchContent({ toolName: "edit", filePath: "web/src/lib/q.ts", content: "{ gcTime: 5 }", cwd: CWD });
  assert.ok(!names(good).includes("arch-react-query-v5-naming"));
});

test("tailwind: bg-red-500 命中,bg-background 不命中", () => {
  const bad = matchContent({ toolName: "edit", filePath: "web/src/components/x.tsx", content: 'className="bg-red-500"', cwd: CWD });
  assert.ok(names(bad).includes("arch-no-hardcoded-tailwind-color"));
  const good = matchContent({ toolName: "edit", filePath: "web/src/components/x.tsx", content: 'className="bg-background"', cwd: CWD });
  assert.ok(!names(good).includes("arch-no-hardcoded-tailwind-color"));
});

test("gorm: FirstOrCreate/.Save/.Count(ctx) 命中", () => {
  for (const c of ["db.FirstOrCreate(&x)", "db.Save(&x)", "gorm.G[T](db).Count(ctx)"]) {
    const hits = matchContent({ toolName: "edit", filePath: "internal/database/seed.go", content: c, cwd: CWD });
    assert.ok(names(hits).includes("arch-gorm-removed-api"), c);
  }
  const good = matchContent({ toolName: "edit", filePath: "internal/database/seed.go", content: 'gorm.G[T](db).Count(ctx, "id")', cwd: CWD });
  assert.ok(!names(good).includes("arch-gorm-removed-api"));
});

test("tool 不在 tools 列表则不命中", () => {
  const hits = matchContent({ toolName: "read", filePath: "web/src/routes/x.tsx", content: "提交", cwd: CWD });
  assert.equal(hits.length, 0);
});

test("bare-fetch: 裸 fetch(/api) 命中,authedFetch 不误伤,lib 排除", () => {
  const bt = String.fromCharCode(96);
  const bad = matchContent({ toolName: "edit", filePath: "web/src/routes/_authed/x.tsx", content: 'const r = await fetch("/api/users")', cwd: CWD });
  assert.ok(names(bad).includes("arch-no-bare-fetch-api"));
  const tmpl = matchContent({ toolName: "edit", filePath: "web/src/routes/_authed/x.tsx", content: "fetch(" + bt + "/api/export" + bt + ")", cwd: CWD });
  assert.ok(names(tmpl).includes("arch-no-bare-fetch-api"));
  const authed = matchContent({ toolName: "edit", filePath: "web/src/routes/_authed/x.tsx", content: 'await authedFetch("/api/upload")', cwd: CWD });
  assert.ok(!names(authed).includes("arch-no-bare-fetch-api"));
  const lib = matchContent({ toolName: "edit", filePath: "web/src/lib/transport.ts", content: 'fetch("/api/x")', cwd: CWD });
  assert.ok(!names(lib).includes("arch-no-bare-fetch-api"));
});

test("globToRegExp: ** 匹配直接子与嵌套,排除 lib", () => {
  const re = globToRegExp("web/src/routes/**/*.tsx");
  assert.ok(re.test("web/src/routes/login.tsx"));
  assert.ok(re.test("web/src/routes/_authed/users.tsx"));
  assert.ok(!re.test("web/src/lib/i18n.tsx"));
});

test("apply_patch: 两文件块只命中含中文的 A 块(防串味)", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: web/src/routes/a.tsx",
    "+<span>提交</span>",
    "*** Update File: internal/x.go",
    "+package x",
    "*** End Patch",
  ].join("\n");
  const items = extractFromPatch(patch);
  const all = items.flatMap((it) => matchContent({ toolName: "apply_patch", filePath: it.filePath, content: it.content, cwd: CWD }));
  assert.deepEqual(names(all), ["arch-i18n-no-hardcoded-cjk"]);
});

test("react-hook-form: 坏样本命中,@tanstack/react-form 不误伤", () => {
  const bad = matchContent({ toolName: "edit", filePath: "web/src/routes/x.tsx", content: 'import { useForm } from "react-hook-form";', cwd: CWD });
  assert.ok(names(bad).includes("arch-no-react-hook-form"));
  const badUi = matchContent({ toolName: "edit", filePath: "web/src/components/x.tsx", content: 'import { Form } from "@/components/ui/form";', cwd: CWD });
  assert.ok(names(badUi).includes("arch-no-react-hook-form"));
  const good = matchContent({ toolName: "edit", filePath: "web/src/routes/x.tsx", content: 'import { useForm } from "@tanstack/react-form";', cwd: CWD });
  assert.ok(!names(good).includes("arch-no-react-hook-form"));
});

test("react-hook-form: 错目录(lib)不命中", () => {
  const hits = matchContent({ toolName: "edit", filePath: "web/src/lib/x.ts", content: 'import { useForm } from "react-hook-form";', cwd: CWD });
  assert.ok(!names(hits).includes("arch-no-react-hook-form"));
});

test("react-hook-form: 绝对路径坏样本命中", () => {
  const hits = matchContent({ toolName: "write", filePath: "C:/repo/web/src/routes/x.tsx", content: 'from "react-hook-form"', cwd: CWD });
  assert.ok(names(hits).includes("arch-no-react-hook-form"));
});

test("zod-v4-email: 坏样本命中,z.email() 不误伤", () => {
  const bad = matchContent({ toolName: "edit", filePath: "web/src/routes/x.tsx", content: "z.string().email(t())", cwd: CWD });
  assert.ok(names(bad).includes("arch-zod-v4-email"));
  const good = matchContent({ toolName: "edit", filePath: "web/src/routes/x.tsx", content: "z.email(t())", cwd: CWD });
  assert.ok(!names(good).includes("arch-zod-v4-email"));
  const good2 = matchContent({ toolName: "edit", filePath: "web/src/routes/x.tsx", content: "z.string().min(8)", cwd: CWD });
  assert.ok(!names(good2).includes("arch-zod-v4-email"));
});

test("zod-v4-email: 错目录(后端 go)不命中", () => {
  const hits = matchContent({ toolName: "edit", filePath: "internal/x.go", content: "z.string().email(", cwd: CWD });
  assert.ok(!names(hits).includes("arch-zod-v4-email"));
});

test("zod-v4-email: 绝对路径坏样本命中", () => {
  const hits = matchContent({ toolName: "write", filePath: "C:/repo/web/src/lib/schema.ts", content: "z.string().email()", cwd: CWD });
  assert.ok(names(hits).includes("arch-zod-v4-email"));
});

test("cgo: 坏样本命中,纯 Go import 不误伤", () => {
  const bad = matchContent({ toolName: "edit", filePath: "internal/x.go", content: 'import "C"', cwd: CWD });
  assert.ok(names(bad).includes("arch-no-cgo"));
  const good = matchContent({ toolName: "edit", filePath: "internal/x.go", content: 'import "context"', cwd: CWD });
  assert.ok(!names(good).includes("arch-no-cgo"));
});

test("cgo: 错目录(前端)不命中", () => {
  const hits = matchContent({ toolName: "edit", filePath: "web/src/x.ts", content: 'import "C"', cwd: CWD });
  assert.ok(!names(hits).includes("arch-no-cgo"));
});

test("cgo: 绝对路径坏样本命中(cmd)", () => {
  const hits = matchContent({ toolName: "write", filePath: "C:/repo/cmd/server/main.go", content: 'import "C"', cwd: CWD });
  assert.ok(names(hits).includes("arch-no-cgo"));
});
