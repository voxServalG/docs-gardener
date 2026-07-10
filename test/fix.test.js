import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fix } from "../src/lib/fix.js";
import { scanHard } from "../src/lib/scan-hard.js";
import { scanSoft } from "../src/lib/scan-soft.js";
import { markRendered, resetMemoryFallback } from "../src/lib/state.js";

test("fix refuses when no scan is cached", () => {
  isolateState();
  const root = makeProject({ "docs/index.md": "# Docs\n" });

  const result = fix(root, config(), {});

  assert.equal(result.ok, false);
  assert.equal(result.tool, "garden-fix");
  assert.equal(result.error.param, "state");
});

test("fix refuses when latest scan has not been rendered", () => {
  isolateState();
  const root = makeProject({ "docs/index.md": "# Docs\n" });
  scanHard(root, config());

  const result = fix(root, config(), {});

  assert.equal(result.ok, false);
  assert.equal(result.error.param, "agentDirective");
});

test("fix validates and caches agent-submitted soft findings", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\n引用 src/missing.ts。\n\n本工具不会自动修改文件。\n",
  });
  scanHard(root, config());
  const scan = scanSoft(root, config(), { categories: ["prose-claims"] });
  const bundle = scan.data.bundles.find((item) => item.claims.length > 0);
  const claim = bundle.claims[0];
  const result = fix(root, config(), {
    findings: [{
      bundleId: bundle.id,
      findings: [{
        rule: "claim-overreaches",
        severity: "warning",
        confidence: 0.8,
        evidence: {
          docCitation: `${bundle.file}:${claim.lineRange[0]}-${claim.lineRange[1]}`,
          oldText: claim.text,
          newText: claim.text.replace("不会", "通常不会"),
        },
        suggestion: { type: "replace_text", text: "把绝对量词改为建议措辞" },
      }],
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-fix");
  assert.equal(result.phase, "fix-plan");
  assert.equal(result.requires_user, true);
  assert.ok(result.data.hardPlan.length > 0);
  assert.ok(result.data.softPlan.length > 0);
  assert.equal(result.data.softPlan[0].action, "replace_text");
});

test("fix accepts an explicit empty judgment set", () => {
  isolateState();
  const root = makeProject({ "docs/index.md": "# Docs\n" });
  scanHard(root, config());
  scanSoft(root, config());

  const result = fix(root, config(), { findings: [] });

  assert.equal(result.ok, true);
  assert.notEqual(result.error && result.error.param, "findings");
});

test("forceRenderAck bypasses render gate", () => {
  isolateState();
  const root = makeProject({ "docs/index.md": "# Docs\n" });
  scanHard(root, config());

  const result = fix(root, config(), { forceRenderAck: true });

  assert.notEqual(result.error && result.error.param, "agentDirective");
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
