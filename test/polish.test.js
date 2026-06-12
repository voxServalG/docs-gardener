import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { polish } from "../src/lib/polish.js";

test("polish returns fixed edit shape and envelope fields", () => {
  const root = makeProject({
    "docs/README.md": "# Guide\n\n请进行检查，并确保用户能够理解。\n",
  });

  const result = polish(root, { docsDir: "docs" }, { file: "docs/README.md" });

  assert.equal(result.ok, true);
  assert.equal(result.phase, "polish");
  assert.equal(result.next, "review");
  assert.equal(result.requires_user, true);
  assert.equal(result.stop_here, true);
  assert.deepEqual(result.allowedTools, ["garden-apply"]);
  assert.equal(result.edits.length, 1);
  assert.deepEqual(Object.keys(result.edits[0]).sort(), [
    "file",
    "newText",
    "oldText",
    "reason",
  ]);
  assert.equal(result.edits[0].file, "docs/README.md");
  assert.equal(result.edits[0].oldText, "请进行检查，并确保用户能够理解。");
  assert.equal(result.edits[0].newText, "请检查，并确保用户能理解。");
});

test("polish skips code fences, inline code, and markdown links", () => {
  const root = makeProject({
    "docs/README.md": [
      "# Guide",
      "",
      "```bash",
      "请进行检查",
      "```",
      "",
      "运行 `docs-gardener mcp` 能够启动服务。",
      "",
      "查看 [能够启动](README.md) 的说明。",
      "",
      "普通文本能够改写。",
    ].join("\n"),
  });

  const result = polish(root, { docsDir: "docs" }, { file: "docs/README.md" });

  assert.equal(result.edits.length, 1);
  assert.equal(result.edits[0].oldText, "普通文本能够改写。");
  assert.equal(result.edits[0].newText, "普通文本能改写。");
});

test("polish reports long lines as findings without edits", () => {
  const longLine = "这是一段很长的文字，用来说明同一个段落里同时包含安装步骤、行为说明、限制条件、例外情况和后续处理方式，因此读者需要花更多时间才能理解。";
  const root = makeProject({
    "docs/README.md": `# Guide\n\n${longLine}\n`,
  });

  const result = polish(root, { docsDir: "docs" }, { file: "docs/README.md" });

  assert.equal(result.edits.length, 0);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].text, longLine);
});

function makeProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-gardener-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return root;
}
