import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanHard } from "../src/lib/scan-hard.js";
import { scanSoft } from "../src/lib/scan-soft.js";
import { resetMemoryFallback } from "../src/lib/state.js";

test("scan-soft returns envelope bound to hard summary hash", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\nSee [scan-hard](scan-hard.md).\n",
    "docs/scan-hard.md": "# garden-scan-hard\n\ngarden-scan-hard 报告 hard errors。\n",
    "src/lib/mcp-server.js": "server.tool(\"garden-scan-hard\", desc, {}, handler)\n",
  });

  const hardResult = scanHard(root, config());
  const result = scanSoft(root, config());

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-soft");
  assert.equal(result.mode, "soft");
  assert.equal(result.next, "garden-fix");
  assert.equal(typeof result.data.hardSummaryRef, "string");
  assert.equal(result.data.hardSummaryRef, hardResult.data.hash);
  assert.ok(Array.isArray(result.data.bundles));
  assert.ok(result.data.bundles.length > 0);
  assert.ok(result.data.agentDirective);
  assert.equal(result.data.agentDirective.renderRequired, true);
});

test("scan-soft respects categories filter", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\n概述内容。\n",
  });

  scanHard(root, config());
  const result = scanSoft(root, config(), { categories: ["progressive-disclosure"] });

  const categories = new Set(result.data.bundles.map((b) => b.category));
  assert.deepEqual([...categories], ["progressive-disclosure"]);
});

test("scan-soft clamps confidenceFloor", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  scanHard(root, config());
  const low = scanSoft(root, config(), { confidenceFloor: -5 });
  scanHard(root, config());
  const high = scanSoft(root, config(), { confidenceFloor: 42 });

  assert.equal(low.data.confidenceFloor, 0);
  assert.equal(high.data.confidenceFloor, 1);
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
