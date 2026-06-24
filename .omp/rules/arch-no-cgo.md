---
description: "纯 Go / CGO_ENABLED=0 — 后端禁止引入 cgo(import \"C\"),否则破坏全静态二进制与 distroless 镜像"
scope: "tool:edit, tool:write"
globs:
  - "internal/**/*.go"
  - "cmd/**/*.go"
interruptMode: always
condition: "import \"C\""
---

检测到 `import "C"`(cgo)。本项目构建 **`CGO_ENABLED=0`** 全静态二进制 + distroless 镜像,引入 cgo 会破坏静态链接、令镜像失去无 glibc 优势,且 `task build:dist` 的 `linux/amd64` 交叉编译会失败。

## 必须这样做
- 删除 cgo 依赖,改用**纯 Go 实现**。本项目已核实纯 Go 选型:SQLite 用 `glebarez/sqlite`、PostgreSQL 用 pgx(`driver/postgres`)、验证码 base64Captcha、对象存储 minio-go、casbin gorm-adapter。
- 新增第三方依赖前确认其纯 Go(无 `import "C"`、无 `// #cgo` 指令)。

完整规约见 `skill://zerx-backend`。
