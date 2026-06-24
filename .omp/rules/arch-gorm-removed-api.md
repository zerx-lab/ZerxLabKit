---
description: "GORM:不得用已移除的 FirstOrCreate/Save;Count 必须传列名;泛型 First 无 .Error"
scope: "tool:edit, tool:write"
globs:
  - "internal/**/*.go"
interruptMode: never
condition:
  - "FirstOrCreate"
  - "\\.Save\\("
  - "\\.Count\\(ctx\\)"
---

检测到本项目已弃用的 GORM 用法:
- `FirstOrCreate` / `.Save(` 已移除 → 用泛型 `gorm.G[T](db).Create(ctx, &x)`;布尔/零值字段更新用 `db.Model(&T{}).Where(...).Updates(map[string]any{...})`(泛型 `Updates(struct)` 跳过零值,无法持久化 false)。
- `.Count(ctx)` 缺列名 → 必须 `gorm.G[T](db).Count(ctx, "id")`。
- 判定无记录用 `errors.Is(err, gorm.ErrRecordNotFound)`;泛型 `First` 返回 `(T, error)`,无 `.Error` 字段。

完整规约见 `skill://zerx-backend`。
