# arch-guard — 架构合规守卫

编辑命中项目架构违规时,自动把"正确做法"提示词注入 AI(硬规则中止重写,软规则随结果折叠提醒),让 AI 在本仓库开发时被动遵守架构约定,而非靠自觉读 skills。

## 体系

| 工具 | 机制 | 状态 |
|---|---|---|
| **omp**(本仓库 harness) | 原生 TTSR(`.omp/rules/*.md`):流式写工具参数时实时正则匹配 + 路径门控 | 核心,已全验证 |
| Claude Code | `.claude/settings.json` PreToolUse 命令 hook → `arch-guard.mjs` | 增量 |
| pi | `.pi/settings.json` PreToolUse(需 `pi install npm:@hsingjui/pi-hooks` + `/reload`) | 增量(第三方包,落地须冒烟) |
| opencode | `.opencode/plugins/arch-guard.ts` 的 `tool.execute.before`,throw 即阻断 | 增量(不拦 subagent,见限制) |
| **Codex** | PreToolUse 当前只拦 Bash,**无法在编辑前拦截文件** | **已知缺口,不覆盖** |

跨工具 4 个臂共享一份匹配逻辑:`match.mjs`(匹配函数)+ `patterns.json`(规则数据)。

## 规则数据两处同步

规则正则维护在两处,**改正则须同步**:
- `.omp/rules/*.md` — omp TTSR 源,frontmatter(`condition`/`globs`/`scope`/`interruptMode`)+ 富正文(命中即注入模型的提示词)。
- `tools/arch-guard/patterns.json` — 跨工具源,正则 + globs + 短提示。

不引入生成器(规则少,避免增加构建步骤)。astCondition 类规则不可移植,故 patterns.json 无对应条目。

## 如何加一条规则

1. 写 `.omp/rules/<name>.md`:frontmatter + 富正文(怎么改、为什么、何时豁免)。
2. 在 `patterns.json` 加同义条目,`regex` 与 `.omp` 的 `condition` 保持一致。
3. 在 `match.test.mjs` 加四类断言(坏样本命中 / 好样本不命中 / 错目录不命中 / 绝对路径坏样本命中)。
4. `node --test` 全绿。

## 各工具开关与限制

- **omp**:`.omp/config.yml` 必须含 `edit.mode: replace`(默认 hashline 的 edit 参数无 `path`,路径门控对增量编辑全失效;`patch` 亦可,token 更省)。`ttsr.repeatMode: after-gap` 让规则反复生效(默认 `once` 整会话每规则只触发一次)。
- **手写 `globToRegExp`**:与 Bun.Glob 非同实现,边界可能微差;靠 `match.test.mjs` 四类断言兜底。不支持 `{a,b}` 分支(当前 globs 无需)。
- **opencode**:不拦经 task 工具派生的 subagent 调用(sst/opencode#5894)。
- **Claude Code**:`permissionDecision:"deny"` 为当前文档形态;较老版本用 `{"decision":"block","reason"}`,落地后在实际版本冒烟确认。
- **命中即拒会打断该次编辑**(硬规则适用);软规则用 omp `interruptMode: never` 不打断(放行编辑 + 注入提示,下一轮纠正)。跨工具命令 hook 只有 deny 一档(全部按硬拦)。

## 冒烟(Windows / win32)

```sh
# 命中(deny)
echo {"tool_name":"Write","cwd":"<repo>","tool_input":{"file_path":"<repo>/web/src/routes/x.tsx","content":"<b>提交</b>"}} > payload.json
node tools/arch-guard/arch-guard.mjs < payload.json   # stdout 含 "permissionDecision":"deny"
# 未命中:content 换 t("submit") 或 file_path 换 internal/x.go → 无输出、exit 0

# 自测
cd tools/arch-guard && node --test
```
