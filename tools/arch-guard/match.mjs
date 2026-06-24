// 共享匹配逻辑:被 stdin 命令 hook 适配器(arch-guard.mjs)与 opencode 插件复用。
// 纯 Node ESM,无第三方依赖。正则语义与 omp TTSR 对齐(new RegExp 无 flag)。
import { readFileSync } from "node:fs";
import path from "node:path";

let _patterns = null;

export function loadPatterns() {
  if (_patterns) return _patterns;
  const raw = readFileSync(new URL("./patterns.json", import.meta.url), "utf8");
  const arr = JSON.parse(raw);
  _patterns = arr.map((p) => ({ ...p, _re: new RegExp(p.regex) }));
  return _patterns;
}

// glob → RegExp。算法:
// ① 逐字符扫描;对除 `*` `/` 外的正则特殊字符(. + ^ $ ( ) [ ] { } | ?)加 \ 转义。
// ② glob 替换:`**/`→`(?:.*/)?`、`**`→`.*`、`*`→`[^/]*`。
// ③ 锚定 ^...$。不支持 {a,b} 分支(当前 globs 无需)。
export function globToRegExp(glob) {
  const special = new Set([".", "+", "^", "$", "(", ")", "[", "]", "{", "}", "|", "?"]);
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** 或 **/
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "/") {
      out += "/";
    } else if (special.has(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return new RegExp("^" + out + "$");
}

// 产出候选路径集 {norm, basename, rel}。
// Claude Code 传绝对 file_path → 必须相对化,否则目录 glob 永不命中。
export function relCandidates(filePath, cwd) {
  const fwd = String(filePath).replace(/\\/g, "/");
  const norm = fwd.replace(/^\.\//, "");
  const basename = norm.split("/").pop();
  const out = { norm, basename };
  if (cwd && path.isAbsolute(filePath)) {
    const rel = path.relative(cwd, filePath).replace(/\\/g, "/");
    if (rel && !rel.startsWith("..")) out.rel = rel;
  }
  return out;
}

export function matchPath(globs, filePath, cwd) {
  const cand = relCandidates(filePath, cwd);
  const values = [cand.norm, cand.basename, cand.rel].filter(Boolean);
  return globs.some((g) => {
    const re = globToRegExp(g);
    return values.some((v) => re.test(v));
  });
}

export function matchContent({ toolName, filePath, content, cwd }) {
  if (!filePath || content == null) return [];
  const hits = [];
  for (const p of loadPatterns()) {
    if (!p.tools.includes(toolName)) continue;
    if (!matchPath(p.globs, filePath, cwd)) continue;
    if (p._re.test(content)) hits.push({ name: p.name, message: p.message });
  }
  return hits;
}

// 从 apply_patch 文本按 `*** Update File:` / `*** Add File:` 分块,
// 每文件取其块内以 `+` 开头的新增行(去掉前导 +)为该文件 content。
export function extractFromPatch(patchText) {
  const lines = String(patchText).split(/\r?\n/);
  const items = [];
  let cur = null;
  const fileHdr = /^\*\*\* (?:Update|Add) File: (.+)$/;
  for (const line of lines) {
    const m = fileHdr.exec(line);
    if (m) {
      if (cur) items.push(cur);
      cur = { filePath: m[1].trim(), added: [] };
      continue;
    }
    if (!cur) continue;
    if (/^\*\*\* /.test(line)) {
      // 其它 *** 指令(End Patch / Delete File 等)结束当前块
      items.push(cur);
      cur = null;
      continue;
    }
    if (line.startsWith("+")) cur.added.push(line.slice(1));
  }
  if (cur) items.push(cur);
  return items.map((it) => ({ filePath: it.filePath, content: it.added.join("\n") }));
}
