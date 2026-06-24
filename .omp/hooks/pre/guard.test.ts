import { test, expect } from "bun:test";
import { classifyBash, isGeneratedPath, normPath, extractPatchPaths } from "./guard.ts";

test("classifyBash: never-legit 硬拦", () => {
  expect(classifyBash("rm -rf /").level).toBe("block");
  expect(classifyBash("rm -rf ~").level).toBe("block");
  expect(classifyBash("rm -fr ..").level).toBe("block");
  expect(classifyBash("rm -Rf *").level).toBe("block");
  expect(classifyBash("rm -r -f /etc").level).toBe("block");
  expect(classifyBash("git push --force origin main").level).toBe("block");
  expect(classifyBash("git push -f").level).toBe("block");
});

test("classifyBash: --force-with-lease 不拦", () => {
  expect(classifyBash("git push --force-with-lease").level).toBe("ok");
});

test("classifyBash: usually-fine 走 confirm", () => {
  expect(classifyBash("rm -rf node_modules").level).toBe("confirm");
  expect(classifyBash("rm -rf bin/zerxlabkit").level).toBe("confirm");
  expect(classifyBash("git reset --hard HEAD~1").level).toBe("confirm");
  expect(classifyBash("psql -c 'DROP TABLE users'").level).toBe("confirm");
  expect(classifyBash("psql -c 'TRUNCATE logs'").level).toBe("confirm");
});

test("classifyBash: 正常命令放行", () => {
  expect(classifyBash("rm -f tmp.txt").level).toBe("ok"); // 无 -r
  expect(classifyBash("rm file.txt").level).toBe("ok");
  expect(classifyBash("go test ./...").level).toBe("ok");
  expect(classifyBash("git push origin main").level).toBe("ok");
  expect(classifyBash("git reset HEAD").level).toBe("ok"); // 非 --hard
});

test("isGeneratedPath: gen 路径命中", () => {
  expect(isGeneratedPath("gen/go/zerx/v1/x.pb.go")).toBe(true);
  expect(isGeneratedPath("internal/query/user.go")).toBe(true);
  expect(isGeneratedPath("web/src/gen/x_pb.ts")).toBe(true);
  expect(isGeneratedPath("web/src/routeTree.gen.ts")).toBe(true);
  expect(isGeneratedPath("web\\src\\routeTree.gen.ts")).toBe(true); // Windows 分隔符
  expect(isGeneratedPath("C:/repo/internal/query/user.go")).toBe(true); // 绝对路径
});

test("isGeneratedPath: 手写路径不误伤", () => {
  expect(isGeneratedPath("internal/model/querier.go")).toBe(false);
  expect(isGeneratedPath("internal/service/user_service.go")).toBe(false);
  expect(isGeneratedPath("web/src/routes/users.tsx")).toBe(false);
  expect(isGeneratedPath("gendarme/x.go")).toBe(false); // 不是 gen/ 前缀
});

test("normPath: 规范化", () => {
  expect(normPath("./Web\\Src\\X.TS")).toBe("web/src/x.ts");
});

test("extractPatchPaths: 提取补丁路径", () => {
  const patch = [
    "*** Begin Patch",
    "*** Update File: internal/query/user.go",
    "+x",
    "*** Add File: web/src/routes/a.tsx",
    "*** End Patch",
  ].join("\n");
  expect(extractPatchPaths(patch)).toEqual(["internal/query/user.go", "web/src/routes/a.tsx"]);
});
