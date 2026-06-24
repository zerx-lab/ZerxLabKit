---
description: "Tailwind v4:禁止写死调色板色值,用语义 token(bg-background/text-foreground 等)"
scope: "tool:edit, tool:write"
globs:
  - "web/src/routes/**/*.tsx"
  - "web/src/components/**/*.tsx"
interruptMode: never
condition: "(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|zinc|neutral|stone|slate)-[0-9]{2,3}"
---

检测到写死的 Tailwind 调色板色值(如 `bg-red-500`)。本项目主题色一律用**语义 token**(定义在 `web/src/styles.css` 的 `:root`/`.dark`,经 `@theme inline` 映射):`bg-background`、`text-foreground`、`text-muted-foreground`、`border-border`、`bg-primary` 等,以支持暗/亮主题。请改用语义 token;确需新色则在 `styles.css` 加 token 再引用。完整规约见 `skill://zerx-frontend`。
