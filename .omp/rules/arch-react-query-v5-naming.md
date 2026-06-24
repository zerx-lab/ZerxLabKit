---
description: "TanStack Query v5:用 gcTime 而非 cacheTime"
scope: "tool:edit, tool:write"
globs:
  - "web/src/**/*.tsx"
  - "web/src/**/*.ts"
interruptMode: never
condition: "\\bcacheTime\\b"
---

检测到 `cacheTime`。本项目用 **TanStack Query v5**:`cacheTime` 已更名为 `gcTime`,请改用 `gcTime`;另注意用 `placeholderData`、以 `isPending` 表达"无数据加载中"语义。完整规约见 `skill://zerx-frontend`。
