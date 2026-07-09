import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fixHard } from "../src/lib/fix-hard.js";
import { runTool } from "../src/lib/run-tool.js";
import { scanHard } from "../src/lib/scan-hard.js";

test("scan-hard returns unified envelope and grouped findings", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n\nSee [Guide](guide.md).\n",
    "docs/guide.md": "# Guide\n\n引用 src/missing.ts 并进行检查。\n",
  });

  const result = scanHard(root, config());

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-hard");
  assert.equal(result.mode, "hard");
  assert.ok(Array.isArray(result.data.hardErrors));
  assert.ok(Array.isArray(result.data.warnings));
  assert.ok(Array.isArray(result.data.styleIssues));
  assert.ok(result.data.hardErrors.some((item) => item.rule === "dead-reference"));
  assert.ok(result.data.styleIssues.some((item) => item.rule === "vague-term"));
  assert.equal(result.summary.hardErrors, result.data.hardErrors.length);
});

test("fix-hard returns approval-required plan for hard errors", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n\nSee [Guide](guide.md).\n",
    "docs/guide.md": "# Guide\n\n引用 src/missing.ts。\n",
  });

  const scanResult = scanHard(root, config());
  const result = fixHard(root, config(), { report: scanResult.data });

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-fix-hard");
  assert.equal(result.phase, "fix-hard-plan");
  assert.equal(result.requires_user, true);
  assert.equal(result.stop_here, true);
  assert.ok(result.data.plan.length > 0);
});

test("runTool dispatches CLI names to garden tools", () => {
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
