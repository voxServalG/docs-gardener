import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { polish } from "../src/lib/polish.js";
import { resetMemoryFallback } from "../src/lib/state.js";

test("polish returns model context, fixed edit schema, and envelope fields", () => {
  isolateState();
  const root = makeProject({
    "docs/README.md": "# Guide\n\n请进行检查，并确保用户能够理解。\n",
    "docs/plain-writing-guidance.md": "# 浅白写作指导\n\n优先使用常见、直接、具体的词语。\n",
  });

  const result = polish(root, { docsDir: "docs" }, { file: "docs/README.md" });

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-polish");
  assert.equal(result.mode, "soft");
  assert.equal(result.phase, "polish");
  assert.equal(result.next, "review");
  assert.equal(result.requires_user, true);
  assert.equal(result.stop_here, true);
  assert.deepEqual(result.allowedTools, []);
  assert.equal(result.doc.path, "docs/README.md");
  assert.match(result.doc.content, /请进行检查/);
  assert.equal(result.guidance.path, "docs/plain-writing-guidance.md");
  assert.match(result.guidance.content, /优先使用常见/);
  assert.deepEqual(result.editSchema.required, ["file", "oldText", "newText", "reason"]);
  assert.equal(result.editSchema.additionalProperties, false);
  assert.equal(result.data.doc.path, "docs/README.md");
  assert.equal("edits" in result, false);
  assert.equal("findings" in result, false);
});

test("polish returns constraints instead of hard-coded edits", () => {
  isolateState();
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

  assert.equal("edits" in result, false);
  assert.equal("findings" in result, false);
  assert.ok(result.constraints.some((item) => item.includes("fenced code blocks")));
  assert.ok(result.constraints.some((item) => item.includes("inline code")));
  assert.ok(result.constraints.some((item) => item.includes("Markdown link targets")));
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

function isolateState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-gardener-state-"));
  process.env.DOCS_GARDENER_STATE_DIR = dir;
  resetMemoryFallback();
}
