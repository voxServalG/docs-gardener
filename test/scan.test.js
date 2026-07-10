import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanAll } from "../src/lib/scan.js";
import { scanHard } from "../src/lib/scan-hard.js";
import { scanSoft } from "../src/lib/scan-soft.js";
import { getProject, resetMemoryFallback } from "../src/lib/state.js";
import { createMockSampler } from "../src/lib/sampling.js";

test("garden-scan runs hard and soft in one call with sampler", async () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\nSee [Guide](guide.md).\n",
    "docs/guide.md": "# Guide\n\ncontent\n",
  });

  const mockSampler = createMockSampler(async () => ({ accepted: [], rejected: [] }));
  const result = await scanAll(root, config(), {}, mockSampler);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan");
  assert.equal(result.mode, "combined");
  assert.equal(result.next, "garden-fix");
  assert.equal(result.data.hard.tool, "garden-scan-hard");
  assert.equal(result.data.soft.tool, "garden-scan-soft");
  assert.ok(result.data.soft.data.findings);
  assert.equal(result.data.soft.data.bundles, undefined);
  assert.equal(result.data.agentDirective.renderRequired, true);
});

test("re-running scan-hard replaces cached hard and clears soft/findings", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  scanHard(root, config());
  const beforeSoft = getProject(root).soft;
  assert.equal(beforeSoft, null);

  scanHard(root, config());
  const afterSoft = getProject(root).soft;
  assert.equal(afterSoft, null);
});

test("scan-hard is idempotent hash for identical inputs", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  const a = scanHard(root, config());
  const b = scanHard(root, config());

  assert.equal(a.data.hash, b.data.hash);
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
