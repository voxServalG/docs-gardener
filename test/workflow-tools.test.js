import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fix } from "../src/lib/fixer.js";
import { runTool } from "../src/lib/run-tool.js";
import { scan } from "../src/lib/scanner.js";

test("scan returns unified envelope and grouped findings", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n\nSee [Guide](guide.md).\n",
    "docs/guide.md": "# Guide\n\n引用 src/missing.ts 并进行检查。\n",
  });

  const result = scan(root, config());

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan");
  assert.equal(result.mode, "hard");
  assert.ok(Array.isArray(result.data.hardErrors));
  assert.ok(Array.isArray(result.data.warnings));
  assert.ok(Array.isArray(result.data.styleIssues));
  assert.ok(result.data.hardErrors.some((item) => item.rule === "dead-reference"));
  assert.ok(result.data.styleIssues.some((item) => item.rule === "vague-term"));
  assert.equal(result.summary.hardErrors, result.data.hardErrors.length);
});

test("fix returns approval-required plan for hard errors", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n\nSee [Guide](guide.md).\n",
    "docs/guide.md": "# Guide\n\n引用 src/missing.ts。\n",
  });

  const scanResult = scan(root, config());
  const result = fix(root, config(), { report: scanResult.data });

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-fix");
  assert.equal(result.phase, "fix-plan");
  assert.equal(result.requires_user, true);
  assert.equal(result.stop_here, true);
  assert.ok(result.data.plan.length > 0);
});

test("runTool dispatches CLI names to garden tools", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  const result = runTool("scan", {}, root);

  assert.equal(result.tool, "garden-scan");
  assert.equal(result.phase, "scan");
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
