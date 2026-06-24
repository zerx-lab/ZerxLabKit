#!/usr/bin/env node
// Claude Code / pi 共用的 PreToolUse 命令 hook 适配器。
// stdin: JSON {tool_name, tool_input|input, cwd}。命中→stdout deny + exit 0;未命中→exit 0 无输出。
import { matchContent, extractFromPatch } from "./match.mjs";

function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", () => resolve(buf));
  });
}

function normalizeTool(name) {
  const n = String(name || "").toLowerCase();
  if (n === "write") return "write";
  if (n === "edit" || n === "multiedit") return "edit";
  if (n === "apply_patch") return "apply_patch";
  return n;
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // 非 JSON → 放行
  }
  const cwd = payload.cwd ?? process.cwd();
  const toolName = normalizeTool(payload.tool_name ?? payload.tool);
  const input = payload.tool_input ?? payload.input ?? {};

  let items = [];
  if (toolName === "apply_patch") {
    const patchText = input.input ?? input.patch ?? input.content ?? "";
    items = extractFromPatch(patchText);
  } else {
    const filePath = input.file_path ?? input.path;
    let content = input.content ?? input.new_string;
    if (content == null && Array.isArray(input.edits)) {
      content = input.edits.map((e) => e.new_string ?? e.new_text ?? "").join("\n");
    }
    if (filePath != null) items = [{ filePath, content: content ?? "" }];
  }

  const hits = items.flatMap((it) =>
    matchContent({ toolName, filePath: it.filePath, content: it.content, cwd }),
  );

  if (hits.length) {
    const msg = "[arch-guard]\n" + hits.map((h) => `${h.name}: ${h.message}`).join("\n");
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: msg,
        },
      }),
    );
  }
  process.exit(0);
}

main();
