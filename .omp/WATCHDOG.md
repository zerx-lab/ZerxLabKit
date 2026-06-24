# Watchdog notes(本项目架构红线,advisor 语义级 review 重点盯)

> 这些是正则/ast 抓不住、但违反即出 bug 或破坏安全模型的红线。TTSR 正则规则见 `.omp/rules/`,互补不重复。

## 鉴权与角色(安全边界)
- service handler 出现**任何形式内联鉴权**(不限 `RequireRole` 字面量,如手判 `claims.Role`)——授权必须只在 Casbin 拦截器。
- 把 RBAC 管理类 procedure(RoleService/MenuService/ApiService 的写、SetRolePermissions、SyncApis)授予非 admin 角色 = **变相提权**,需明确意图。
- 角色 `code` 改名 = 破坏事实主键(User.Role / casbin sub / RoleMenu/RoleButton 关联)。内置 `admin`/`user` code 不可改。
- 按钮权限(`<Can code>`)纯前端 UX 显隐,**非安全边界**;真正鉴权在同名 procedure 的 Casbin 策略。

## 进程内缓存一致性(隐蔽红线)
- 写 SysParam **必须经 `param.Cache.Set(ctx, k, v)`**(自动同步缓存),或写后紧跟 `cache.Reload(ctx)`;**绝不可裸 `gorm.G[SysParam]...Create/Updates` 而不刷新缓存** → 内存与 DB 不一致(stale 参数)。
- 同理排查任何"进程内缓存 + DB"成对状态(param/casbin 决策缓存等)写后是否刷新。

## 数据访问
- 自定义 querier(`internal/model/querier.go`)raw SQL:**必须 `@name` 绑定参数 + 显式 `AND deleted_at IS NULL`**(raw SQL 绕过 GORM 软删)。
- 新增模型须加进 `internal/database/migrate.go` 的 gormigrate migration(`0001_baseline` 的 `AutoMigrate(...)` 列表),不是裸 AutoMigrate。
- 读 proto 字段用 getter(`req.Msg.GetXxx()`),直接取字段会被 nilaway 标记。

## 定时任务
- 新增 job handler 必须注册进 `internal/jobs/registry.go` 的 `NewRegistry`(UI 只能调度白名单内的);cron 用 5 段标准格式(`ValidCron` 校验,无秒位)。

## 日志与审计
- OperationLog 唯一写入者是 `internal/server/audit_interceptor.go`,**永不记录 body**;新增写操作前缀须被 `mutatingPrefixes` 覆盖才会记录,否则审计漏记。
- 错误日志 = OperationLog 中 `status != "ok"` 的行,无独立表;别另建错误日志表/写入点。

## 前端
- 新增 i18n key 时 en/zh 是否同步;`t(key)` 的 key 是否真实存在于字典。
- 误用 react-hook-form / shadcn `form` 组件而非 `@tanstack/react-form`;Zod 须用 v4 顶层格式函数(`z.email()`)。

## 构建
- 新增依赖必须纯 Go(`CGO_ENABLED=0`),不得引入 cgo 依赖。
