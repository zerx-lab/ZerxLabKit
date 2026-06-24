---
description: "service handler 一律不得调用 auth.RequireRole — 接口鉴权唯一权威是 Casbin 拦截器"
scope: "tool:edit, tool:write"
globs:
  - "internal/service/**/*.go"
condition: "RequireRole"
---

检测到你在 service handler 里写了 `RequireRole`。本项目**接口鉴权唯一权威是 Casbin 拦截器**(`internal/auth/casbin_interceptor.go`):`sub=角色 code`、`obj=connectRPC procedure`,精确匹配;admin 绕过。

## 必须这样做
- 删除 handler 内任何 `auth.RequireRole(...)`。handler 只写业务,授权交拦截器统一裁决。
- 免认证 procedure 进 `internal/server/server.go` 的 `public` map;已登录即放行的进 `selfServe` map。
- 给角色授权到「角色管理」页分配,即时生效。

照抄 `internal/service/user_service.go` 范式(注释 "Authorization is enforced by the Casbin interceptor");完整规约见 `skill://zerx-authz`。
