---
description: "前端禁止裸 fetch 调后端 /api — 必须走 connect-query hook 或 transport.ts 的 authedFetch(含 401 single-flight 刷新)"
scope: "tool:edit, tool:write"
globs:
  - "web/src/routes/**/*.tsx"
  - "web/src/routes/**/*.ts"
  - "web/src/components/**/*.tsx"
  - "web/src/components/**/*.ts"
interruptMode: never
condition: "(^|[^a-zA-Z])fetch\\([\"'`]/api"
---

检测到裸 `fetch("/api/...")`。本项目调后端**不得直接 fetch**:裸 fetch 绕过 `web/src/lib/transport.ts` 的 401 → single-flight 刷新逻辑,access token(15m)过期后会静默 401。

## 必须这样做
- connectRPC 方法:用 connect-query hook —— `useQuery(method, input?)` / `useMutation(method)`(transport 已注入 auth 拦截器与刷新)。
- 非 connectRPC 端点(上传 `/api/upload`、导入导出等):用 `authedFetch(input, init?)`(`import { authedFetch } from "@/lib/transport"`),它共享同一套 401 刷新。

参考 `web/src/routes/_authed/files.tsx`(`authedFetch("/api/upload", ...)`)、`users.tsx`(导出 `authedFetch(\`/api/export/users?...\`)`)。完整规约见 `skill://zerx-frontend`。
