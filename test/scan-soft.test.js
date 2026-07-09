import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanHard } from "../src/lib/scan-hard.js";
import { scanSoft } from "../src/lib/scan-soft.js";

test("scan-soft returns envelope with bundles bound to hard summary", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n\nSee [garden-scan-hard](scan-hard.md).\n",
    "docs/scan-hard.md": "# garden-scan-hard\n\ngarden-scan-hard 报告 hard errors。\n",
    "src/lib/mcp-server.js": "server.tool(\"garden-scan-hard\", desc, {}, handler)\n",
  });

  const hard = scanHard(root, config()).data;
  const result = scanSoft(root, config(), { report: hard });

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-soft");
  assert.equal(result.mode, "soft");
  assert.equal(result.next, "garden-fix-soft");
  assert.equal(result.requires_user, true);
  assert.equal(result.stop_here, true);
  assert.equal(typeof result.data.hardSummaryRef, "string");
  assert.ok(Array.isArray(result.data.bundles));
  assert.ok(result.data.bundles.length > 0);
  assert.ok(result.data.bundles.some((b) => b.category === "progressive-disclosure"));
  assert.ok(Array.isArray(result.data.constraints));
  assert.ok(result.data.findingSchema);
});

test("scan-soft respects categories filter", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n\n概述内容。\n",
  });

  const result = scanSoft(root, config(), { categories: ["progressive-disclosure"] });

  const categories = new Set(result.data.bundles.map((b) => b.category));
  assert.deepEqual([...categories], ["progressive-disclosure"]);
});

test("scan-soft clamps confidenceFloor", () => {
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  const low = scanSoft(root, config(), { confidenceFloor: -5 });
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
