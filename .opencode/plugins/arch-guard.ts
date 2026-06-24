import { matchContent, extractFromPatch } from "../../tools/arch-guard/match.mjs";

export const ArchGuard = async ({ directory }: { directory: string }) => ({
  "tool.execute.before": async (
    input: { tool: string },
    output: { args?: Record<string, any> },
  ) => {
    const tool = input.tool;
    const cwd = directory;
    const args = output.args ?? {};
    let items: { filePath: string; content: string }[] = [];
    if (tool === "write" || tool === "edit") {
      const filePath = args.filePath ?? args.path;
      const content = args.content ?? args.newString ?? args.new_string ?? "";
      if (filePath) items = [{ filePath, content }];
    } else if (tool === "apply_patch") {
      items = extractFromPatch(args.patchText ?? args.patch ?? args.input ?? "");
    } else {
      return;
    }
    const hits = items.flatMap((it) =>
      matchContent({ toolName: tool, filePath: it.filePath, content: it.content, cwd }),
    );
    if (hits.length) {
      throw new Error("[arch-guard]\n" + hits.map((h) => `${h.name}: ${h.message}`).join("\n"));
    }
  },
});
