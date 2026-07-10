import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runTool } from "../src/lib/run-tool.js";
import { scanHard } from "../src/lib/scan-hard.js";
import { resetMemoryFallback } from "../src/lib/state.js";

test("scan-hard returns envelope with agentDirective and hash", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\nSee [Guide](guide.md).\n",
    "docs/guide.md": "# Guide\n\n引用 src/missing.ts 并进行检查。\n",
  });

  const result = scanHard(root, config());

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-hard");
  assert.equal(result.mode, "hard");
  assert.ok(Array.isArray(result.data.hardErrors));
  assert.ok(result.data.hardErrors.some((item) => item.rule === "dead-reference"));
  assert.ok(result.data.styleIssues.some((item) => item.rule === "vague-term"));
  assert.equal(result.summary.hardErrors, result.data.hardErrors.length);
  assert.equal(typeof result.data.hash, "string");
  assert.ok(result.data.agentDirective);
  assert.equal(result.data.agentDirective.renderRequired, true);
  assert.ok(result.data.agentDirective.forbiddenTerms);
});

test("runTool dispatches CLI names to garden tools synchronously", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  const result = runTool("scan-hard", {}, root);

  assert.equal(result.tool, "garden-scan-hard");
  assert.equal(result.phase, "scan-hard");
});

function config() {
  return {
    docsDir: "docs",
    codeDirs: ["src"],
    codeExt: ".ts",
    baseBranch: "main",
    catalogs: {},
  };
}

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
