---
description: "前端表单一律用 @tanstack/react-form — 禁止 react-hook-form 或 shadcn 的 form 组件"
scope: "tool:edit, tool:write"
globs:
  - "web/src/routes/**/*.tsx"
  - "web/src/components/**/*.tsx"
interruptMode: never
condition: "from [\"'`]react-hook-form[\"'`]|from [\"'`]@/components/ui/form[\"'`]"
---

检测到引入了 `react-hook-form` 或 shadcn 的 `@/components/ui/form` 组件。本项目表单**统一用 `@tanstack/react-form`**(不是 react-hook-form,也不是 shadcn `form`)。

## 必须这样做
- `import { useForm } from "@tanstack/react-form";`,用 `form.Field` + `field.state` 渲染;校验用 `validators: { onChange: <zodSchema> }`。
- 可复用字段组件用 `AnyFieldApi`(`import { type AnyFieldApi } from "@tanstack/react-form"`)。
- 错误取 `firstErrorMessage(field.state.meta.errors)`。

范式见 `web/src/routes/_authed/users.tsx`、`web/src/routes/login.tsx`;完整规约见 `skill://zerx-frontend`。
