# zerxLabKit — AI 开发指南

> 本文件指导在本仓库之上进行的后续开发(人类与 AI 通用)。所有面向用户的叙述请用**简体中文**(与全局规则一致);代码、命令、标识符保持原样。

## 1. 项目概览

生产可部署、AI 友好的全栈后台管理脚手架:

- **后端**:Go + [connectRPC](https://connectrpc.com)(HTTP/1.1 + h2c)、[GORM](https://gorm.io) 泛型 API + GORM CLI 代码生成、多数据源(PostgreSQL / MySQL / SQLite)。
- **前端**:React 19 + Vite + TanStack(Router / Query / Table / Form)+ Radix(shadcn/ui)+ Tailwind v4 + Zod 4;侧边栏管理布局、暗/亮主题、中英(zh/en)i18n。
- **打包**:后端用 `go:embed` 内嵌前端产物;`CGO_ENABLED=0` 全静态二进制 + distroless 镜像(无 glibc,镜像约 44 MB)。
- **契约**:proto 声明式校验(protovalidate)、JWT 认证、最小 RBAC;无默认账号——首次注册的用户自动成为管理员。
- **质量门禁**:Go 空指针静态分析(nilaway)、govet nilness、golangci-lint;前端严格 TypeScript + ESLint。

数据流:浏览器 SPA → `/api/...`(同源)→ connectRPC handler → 拦截器链(日志 → 认证 → 校验 → recover)→ service → GORM → 数据库。生产为单二进制同源部署;开发用 Vite 代理(`:5173` → `:8080`)。

## 2. 目录结构

```
.
├── Taskfile.yml + taskfiles/{backend,frontend,proto,db,deps,docker}.yml  # 一键化
├── buf.yaml / buf.gen.yaml(Go)/ buf.gen.web.yaml(TS)/ buf.lock
├── proto/zerx/v1/{common,auth,user,role,menu,api,dict,param,file,log}.proto  # 唯一契约来源
├── gen/go/zerx/v1/                             # 生成(提交):*.pb.go + zerxv1connect/*.connect.go
├── cmd/server/main.go                          # 入口:config→db→migrate→seed→serve(h2c)
├── internal/
│   ├── config/      # 12-factor 类型化配置(caarlos0/env + godotenv);含 Auth/Storage
│   ├── database/    # Open(多数据源)/ Migrate / Seed(角色/菜单/按钮/API 目录)/ gen.go
│   ├── model/       # GORM 模型 + querier.go(GORM CLI 输入接口)
│   ├── query/       # GORM CLI 生成(提交):Query[T] + 字段助手
│   ├── auth/        # bcrypt / JWT(jti=会话)/ ctx claims / 认证拦截器 / Casbin 接口鉴权拦截器
│   ├── casbin/      # SyncedCachedEnforcer 封装(sub=角色 code, obj=procedure);gorm-adapter
│   ├── captcha/     # base64Captcha 内存验证码(进程内)
│   ├── ratelimit/   # 登录防爆破(内存滑动窗口:验证码阈值/锁定阈值)
│   ├── param/       # 系统参数运行时缓存(进程内)
│   ├── apispec/     # proto 反射枚举 procedure(API 目录种子/同步)
│   ├── storage/     # 对象存储抽象:local(磁盘)/ s3(minio-go)
│   ├── service/     # connectRPC handler 实现 + convert.go
│   ├── server/      # New() 装配:拦截器链 + 操作日志/审计拦截器 + /api 路由 + /api/upload + SPA + /healthz
│   └── web/         # embed.go(go:embed all:dist)+ dist/(前端产物落点)
└── web/
    ├── vite.config.ts / tsconfig*.json / eslint.config.js / components.json
    └── src/
        ├── main.tsx / router.tsx / styles.css / routeTree.gen.ts(生成,提交)
        ├── gen/                # 生成(提交):*_pb.ts + *-<Service>_connectquery.ts + buf/validate/validate_pb.ts
        ├── lib/{transport,query-client,auth,utils,form,theme,i18n}.ts
        ├── components/{ui/,theme-toggle,language-switcher}.tsx  # shadcn + 主题/语言切换
        └── routes/{__root,index,login,register}.tsx + _authed/{route(侧边栏壳),dashboard,users}.tsx
```

**生成代码全部提交入库**(`gen/`、`web/src/gen/`、`internal/query/`、`web/src/routeTree.gen.ts`),因此 Docker / CI / 日常构建**不重跑 codegen**,且 AI 始终能看到完整类型。

## 3. 技术栈与版本

精确版本以 `go.mod` 与 `web/package.json` 为准(由 lockfile 钉死)。关键主版本:

| 领域 | 选型 |
|---|---|
| Go | 1.26;connect v1.19.x、protobuf-go v1.36.x、gorm v1.31.x、gorm/cli v0.2.x、jwt/v5、glebarez/sqlite(纯 Go)、driver/postgres(pgx,纯 Go)、driver/mysql |
| 校验 | protovalidate(connectrpc.com/validate,**unstable,钉精确版本**) |
| 前端 | React 19、TanStack Router/Query v5/Table **v8**/Form v1、protobuf-es v2、connect/connect-web/connect-query v2、Zod **v4**、Tailwind **v4**、Vite v8、TypeScript 6 |
| 工具 | buf(系统级)、golangci-lint v2 + nilaway(`go.mod` tool 块,`go tool` 调用)、air + gorm cli + process-compose(`go install` 到 `./.bin`) |

## 4. 一键命令(Taskfile)

| 命令 | 作用 |
|---|---|
| `task sync` | 首次设置:装工具/依赖 → 生成代码 → `go mod tidy` → 创建 `.env` → 启动 dev PostgreSQL(`docker compose up -d --wait postgres`) |
| `task dev` | 启动 dev PostgreSQL(`db:up`,数据存于命名卷 `zerxlabkit_pgdata`)后,在 **process-compose TUI** 中并行跑后端(air 热重载)+ 前端(Vite);前端 `:5173` 代理到后端 `:8080`。TUI:↑/↓ 选择 · F5 重启 · F9 停止 · F7 启动 · F10 退出。process-compose 自身 API 用 `:8088`(避让应用的 `:8080`);退出会连带清理子进程(不会残留占用 `:8080`) |
| `task gen` | 生成全部代码(proto Go/TS + GORM 查询) |
| `task build` | 构建 SPA → 本机单二进制(内嵌 SPA),产物 `bin/zerxlabkit[.exe]` |
| `task build:dist` | 构建 SPA → 静态 `linux/amd64` 二进制 `bin/zerxlabkit-linux-amd64` |
| `task lint` | 后端 golangci-lint + nilaway;前端 ESLint + `tsc --noEmit` |
| `task test` | `go test ./...`(前端暂无测试) |
| `task run` | 运行已构建二进制(需 `JWT_SECRET`,`.env` 在 dev 即可) |
| `task docker:build` / `docker:up` / `docker:down` / `db:up` / `db:down` | 构建镜像 / 起停整套 compose(app + postgres,数据持久化于命名卷 `zerxlabkit_pgdata`)/ 起停本地 dev PostgreSQL。MySQL 在 `docker-compose.yml` 中默认注释,需手动取消注释启用 |
| `task deps:update` / `deps:rollback` | 升级全部依赖(先快照)/ 从快照回退 |

**提交前务必**:`task lint && task test`。

## 5. AI 工作流(如何扩展)

### 授权铁律(必读)
- **接口鉴权的唯一权威是 Casbin 拦截器**(`internal/auth/casbin_interceptor.go`)。handler **一律不写** `auth.RequireRole(...)`——授权完全由拦截器统一裁决:`sub=角色 code`、`obj=connectRPC procedure`,精确匹配。
- **admin 角色绕过 Casbin**(始终放行)。内置 `admin`/`user` 两角色(code 不可改名)。
- 三层访问控制(顺序固定,见 `server.go` 的 `public`/`selfServe` map):`public`(免认证:Login/Register/Refresh/GetCaptcha)→ `selfServe`(已登录即放行:Me/Logout/ListSessions/RevokeSession/GetUserMenus/GetUserButtons/GetDictByType)→ admin 绕过 → 否则 `enforcer.Enforce(role, procedure)`。
- 把任意 procedure(含写操作)授予某角色即**即时生效**——这是 RBAC 可用的关键。**安全须知**:把 RBAC 管理类 procedure(RoleService/MenuService/ApiService 的写、SetRolePermissions、SyncApis)授予非 admin 等于授予提权能力,由管理员自行谨慎;默认仅 admin 拥有(靠绕过),新角色默认无任何策略。
- **菜单可见性、按钮权限是独立关联表(RoleMenu/RoleButton),不走 Casbin**。按钮权限(`<Can code>`)纯前端 UX 显隐,**非安全边界**;约定 button code = `<资源>:<动作>`(如 `user:create`),其真正鉴权始终在同名 procedure 的 Casbin 策略上。

### 新增一个 RPC
1. 编辑 `proto/zerx/v1/*.proto`,加 message / rpc;**方法名避开 JS 保留字**。校验约束写在字段上:`[(buf.validate.field).string.email = true]`。
2. `task gen` → 产出 Go handler 接口 + TS 类型 + connect-query hook。
3. 在 `internal/service/` 实现 handler 方法,**照抄 `user_service.go` 范式但不写 RequireRole**(授权交 Casbin)。
4. 若新增 service:在 `internal/server/server.go` 用 `api.Handle(zerxv1connect.NewXxxServiceHandler(svc, opts))` 注册;免认证的 procedure 进 `public`,已登录即放行的进 `selfServe`。
5. 前端:`import { method } from "@/gen/.../<svc>-<Service>_connectquery"`,用 `useQuery(method, input?)` / `useMutation(method)`。

### 新增一个管理模块(完整清单)
1. proto(`proto/zerx/v1/<mod>.proto`)→ `task gen`。
2. model(`internal/model/<mod>.go`,标准字段块)→ 在 `internal/database/migrate.go` 的 `AutoMigrate` 注册。
3. service(`internal/service/<mod>_service.go`,照抄 user_service,**无 RequireRole**)。
4. server.go 注册 handler;按需把 procedure 加入 `public`/`selfServe`。
5. 前端页(`web/src/routes/_authed/<mod>.tsx`,复刻 `params.tsx`/`users.tsx` 范式),增删改按钮用 `<Can code>` 包裹。
6. i18n:`web/src/lib/i18n.tsx` 的 `en` 与 `zh` **同步**加 key(`const zh: typeof en` 结构锁会让缺 key 编译失败)。
7. 在 `internal/database/seed.go` 的 `seedMenuTree` 切片加一条菜单(+按钮);Title 存 i18n key,Icon 存 lucide 名(并在 `web/src/lib/menu-icons.ts` 的 `iconByName` 注册图标)。
8. `task frontend:build`(或 dev)让 Vite 插件重生成 `routeTree.gen.ts` 并提交。
9. 如需授予非 admin:到「角色管理」页为角色分配菜单 / API procedure / 按钮。

### 新增模型 / 自定义查询
1. 在 `internal/model/` 写结构体;在 `internal/database/migrate.go` 的 `AutoMigrate` 加入。新模型默认查询用 `gorm.G[T]` 无需 codegen,仅在写自定义 SQL querier 时才 `task gen:db`。
2. 数据访问优先泛型 API:`gorm.G[model.T](db).Where(...).First(ctx)` / `.Find(ctx)` / `.Create(ctx, &x)`。布尔/零值字段更新用 `db.Model(&T{}).Where(...).Updates(map[string]any{...})`(泛型 `Updates(struct)` 跳过零值,无法持久化 false)。
3. 需要自定义 SQL 时,在 `internal/model/querier.go` 的接口方法上写 SQL 注释(**绑定参数 `@name`、单引号字符串,且 raw SQL 不走软删,需显式 `AND deleted_at IS NULL`**),再 `task gen`(或 `task db:gen`)。

### 校验与鉴权
- 输入校验全部声明在 proto 上,由 `validate.NewInterceptor()` 在服务端自动执行 → 失败返回 `CodeInvalidArgument`;handler 内的 `req.Msg` 已被保证非空且合法。
- 认证由 `auth.NewAuthInterceptor` 处理:解析 `Authorization: Bearer <access>` → 注入 claims;非 public procedure 无有效 token → `CodeUnauthenticated`。**授权见上方「授权铁律」——一律 Casbin,不用 RequireRole。**

### 首次运行与注册 / 种子
- `database.Seed` 在迁移后运行,**幂等键 = Role 表为空**:首次播种 admin/user 角色、`seedMenuTree` 全部菜单+按钮、admin→全部菜单/按钮、user→仅 dashboard,以及 `apispec.Procedures()` 全量 upsert 进 API 目录。Casbin 策略不播种(admin 绕过、user 仅靠 selfServe)。
- 无默认账号。`AuthService.Register`(public):**当库中用户数为 0 时,首个注册者角色为 `admin`**,其后为 `user`。邮箱唯一(冲突 → `CodeAlreadyExists`)。

### 主题与多语言
- 主题:`lib/theme.tsx` 的 `ThemeProvider`/`useTheme`。新增样式用语义 token(`bg-background`/`text-foreground` 等),勿写死颜色。
- 多语言:`lib/i18n.tsx` 的 `I18nProvider`/`useI18n`→`t(key, params?)`。新增文案需在 `en`/`zh` 两个字典加同名 key。
- 布局壳在 `routes/_authed/route.tsx`(侧边栏 + 顶栏)。**侧边栏菜单是动态的**:`useQuery(getUserMenus)` 拉取服务端树,`menu.path===""` 渲染为分组标题,菜单文字用 `t(menu.title)`(内置菜单 title 是 i18n key;自定义菜单是字面量,`t()` 未命中回退原串)。新增菜单改 `seed.go` 的 `seedMenuTree`,不再改前端 navItems。

## 6. 易错点清单

### 后端
- `Count` 必须传列名:`gorm.G[T](db).Count(ctx, "id")`。
- 判定无记录用 `errors.Is(err, gorm.ErrRecordNotFound)`;泛型 `First` 返回 `(T, error)`,**没有 `.Error` 字段**(已移除 `FirstOrCreate`/`Save`)。
- 读取 proto 字段用 **getter**(`req.Msg.GetEmail()`),这样 nilaway 能识别空安全;直接取字段可能被 nilaway 标记。
- proto 方法名**避开 JS 保留字**。
- 自定义 querier 用绑定参数 + 显式 `deleted_at IS NULL`(见上)。
- `task lint` 会跑 **nilaway**(已 `-exclude-pkgs` 排除 `gen`、`internal/query`)。

### 前端
- react-query v5:用 `gcTime`(非 `cacheTime`)、`placeholderData`、`isPending`(非 `isLoading` 语义)。
- Tailwind v4:动画用 `tw-animate-css`(非 `tailwindcss-animate`);**无** `tailwind.config.js` / `postcss.config.js`,主题变量在 `src/styles.css`。
- Zod 4:用顶层格式函数 `z.email()` 等;object 级 `.refine/.check` 仅在所有基础字段通过后运行;Standard Schema **不做 transform**,`onSubmit` 拿到的是输入值。
- connect `Interceptor` 数组**末尾先执行**(洋葱模型)。
- `createConnectQueryKey` 用**对象参**:`createConnectQueryKey({ schema: method, cardinality: "finite", input? })`,用于 `invalidateQueries`。
- `uint64` → **`bigint`**(如 `User.id` 是 `bigint`):显示用 `String(id)`,传参直接用 `bigint`。
- 表单用 **`@tanstack/react-form`**(不是 shadcn 的 `form` 组件 / react-hook-form);可复用字段组件可用 `AnyFieldApi` 类型。
- TS 已**关闭 `exactOptionalPropertyTypes`**:它与 shadcn/Radix 组件不兼容(会让每次 `shadcn add` 的组件报错)。其余严格 flag(`strict`、`noUncheckedIndexedAccess`、`noUnusedLocals/Parameters`)保留。
- 主题色一律用语义 token(定义在 `src/styles.css` 的 `:root`/`.dark`,经 `@theme inline` 映射);Toaster 主题由 `__root.tsx` 透传 `useTheme()`。
- i18n 文案务必 en/zh 同步加 key;`t()` 缺失时回退 en 再回退 key。

## 7. 安全

- **生产必设 `JWT_SECRET`**:缺失则启动失败(`os.Exit(1)`)。
- **无默认账号**:不再 seed 管理员;首次运行在 `/register` 注册——首个用户即管理员,生产环境请尽快注册并妥善保管。
- h2c(明文 HTTP/2)仅供 `grpcurl` 等工具;浏览器 SPA 走 HTTP/1.1,不依赖 h2c。
- 访问令牌 15m、刷新令牌 168h;前端 `transport.ts` 实现 401 → single-flight 刷新 → 重试一次 → 仍失败则清 token 跳登录。
- **多点登录与会话**:刷新令牌的 jti 即会话 ID,对应 `user_sessions` 行。`AUTH_SINGLE_SESSION=true` 时每次登录在同一事务内删除该用户的其它会话(单端);默认允许多端,由「会话管理」页查看/下线。撤销会话即时阻断 refresh;access token 无状态,自然过期后(≤15m)彻底失效——即时强制下线需每请求查会话(默认不开)。
- **验证码 / 防爆破**:`internal/ratelimit` 按 `email|IP` 滑动窗口计数,达 `AUTH_CAPTCHA_THRESHOLD` 后登录需 base64 验证码,达 `AUTH_LOCK_THRESHOLD` 后临时锁定 `AUTH_LOCK_FOR`。登录成功/失败均写 `login_logs`。
- **操作/错误日志**:`internal/server/audit_interceptor.go` 是 OperationLog 的唯一写入者,记录所有写操作与失败请求(永不记录 body),并兼任 panic 兜底(具名返回 + recover,替代 `connect.WithRecover`,把 panic 与栈写入同一行)。错误日志 = OperationLog 中 `status != "ok"` 的行,无独立表。
- **Role-as-code 局限**:角色以字符串 `code` 为业务键,code 不可改名(是 User.Role / casbin sub / 关联表的事实主键);单角色(User.Role 单值、casbin 无 `g` 继承);**仅接口级鉴权,无数据/行级权限**。多角色/数据权限需后续改造。
- **进程内状态(单实例假设)**:LoginGuard、param.Cache、captcha 内存 store、Casbin 决策缓存均为进程内状态,水平扩容时不跨实例一致(本脚手架无 Redis,是有意取舍)。
- **IP 来源**:取 `req.Peer().Addr` 去端口;反向代理后会变代理 IP,生产经代理需自行接 `X-Forwarded-For`。
- **上传**:`/api/upload`(multipart)任意已登录用户可用;20MB 上限、扩展名白名单、uuid key 防碰撞;前端用 `transport.ts` 的 `authedFetch`(共享 401 刷新)。对象存储 driver=local|s3(见 `.env.example`)。
- **纯 Go / CGO-free**:构建 `CGO_ENABLED=0`;新增依赖须纯 Go(casbin/gorm-adapter、base64Captcha、minio-go 均已核实)。

## 8. 版本维护

- `buf.gen.yaml` 内 Go 插件的 `@version` 字符串(`protoc-gen-go`、`protoc-gen-connect-go`)需与 `go.mod` 中对应库版本**手动保持一致**;升级库后同步改这两个字符串再 `task gen`。
- TS proto 生成走 `buf.gen.web.yaml` + `--include-imports`(为生成 `buf/validate/validate_pb.ts`);Go 生成不加该 flag(protovalidate 来自 Go module,避免重复生成 WKT)。
- `connectrpc.com/validate` 为 unstable,升级前先读其 CHANGELOG。
- 升级流程:`task deps:update`(自动快照)→ `task build && task lint && task test` 验证;有问题 `task deps:rollback`。
