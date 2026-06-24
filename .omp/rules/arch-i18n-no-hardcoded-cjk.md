---
description: "前端页面/组件禁止硬编码 CJK 文案 — 用户可见文本必须经 i18n 的 t(key),并在 web/src/lib/i18n.tsx 的 en 与 zh 同步加 key"
scope: "tool:edit, tool:write"
globs:
  - "web/src/routes/**/*.tsx"
  - "web/src/components/**/*.tsx"
interruptMode: never
condition: "[\\u4e00-\\u9fff\\u3400-\\u4dbf\\u3000-\\u303f\\uff01-\\uff60]"
---

检测到你在前端页面/组件里写了 CJK(中文等)字面量。本项目所有**用户可见文本**必须走 i18n,不得硬编码。

## 必须这样做
1. 在 `web/src/lib/i18n.tsx` 的 `en` 字典加语义化 key(如 `users.createTitle`),值为英文文案。
2. 在同文件 `zh` 字典加**同名 key**(`const zh: typeof en` 结构锁要求 en/zh key 完全一致,缺则编译失败)。
3. 组件内 `const { t } = useI18n();`,把字面量换成 `t("users.createTitle")`;带参用 `t(key, { name })`。

## 何时忽略本提醒
- 这是代码注释 / 非用户可见字符串(日志、内部常量):可忽略。
- 你在编辑 i18n 字典本身:本规则已按 globs 排除 `web/src/lib/`,正常不会在此触发。

范式见 `web/src/routes/_authed/users.tsx`(`createUserSchema(t)`、`t(...)`);完整规约见 `skill://zerx-frontend`。
