---
description: "Zod 4:邮箱校验用顶层 z.email() — 禁止 v3 式 z.string().email()"
scope: "tool:edit, tool:write"
globs:
  - "web/src/**/*.tsx"
  - "web/src/**/*.ts"
interruptMode: never
condition: "z\\.string\\(\\)\\.email\\("
---

检测到 Zod v3 式 `z.string().email(...)`。本项目用 **Zod 4**:校验格式用**顶层格式函数**,邮箱写 `z.email(message?)`(同理 `z.url()`、`z.uuid()` 等)。

## 必须这样做
- `z.email(t("validation.email"))` 替换 `z.string().email(...)`。
- object 级 `.refine/.check` 仅在所有基础字段通过后运行;Standard Schema 不做 transform,`onSubmit` 拿到的是输入值。

范式见 `web/src/routes/_authed/users.tsx`(`email: z.email(t("validation.email"))`);完整规约见 `skill://zerx-frontend`。
