import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanHard } from "../src/lib/scan-hard.js";
import { scanSoft } from "../src/lib/scan-soft.js";
import { resetMemoryFallback } from "../src/lib/state.js";

test("scan-soft returns evidence and an agent judgment contract", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\n本工具不会修改文件。\n",
    "src/lib/mcp-server.js": "server.tool(\"garden-scan-hard\", desc, {}, handler)\n",
  });

  scanHard(root, config());
  const result = scanSoft(root, config());

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-soft");
  assert.equal(result.mode, "soft");
  assert.equal(result.next, "garden-fix");
  assert.ok(Array.isArray(result.data.bundles));
  assert.ok(result.data.bundles.length > 0);
  assert.ok(result.data.findingSchema);
  assert.ok(Array.isArray(result.data.constraints));
  assert.ok(result.data.agentDirective);
  assert.equal(result.data.agentDirective.renderRequired, true);
  assert.ok(result.data.agentDirective.forbiddenTerms);
  assert.ok(result.data.agentDirective.forbiddenTerms.includes("bundle"));
  assert.ok(result.data.agentDirective.userRenderTemplate);
});

test("scan-soft caches evidence without requiring an MCP sampler", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n",
  });

  scanHard(root, config());
  const result = scanSoft(root, config());

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-soft");
  assert.ok(Array.isArray(result.data.bundles));
  assert.equal("findings" in result.data, false);
});

test("scan-soft respects categories filter", () => {
  isolateState();
  const root = makeProject({
    "docs/index.md": "# Docs\n\n概述内容。\n",
  });

  scanHard(root, config());
  const result = scanSoft(root, config(), { categories: ["progressive-disclosure"] });

  assert.equal(result.data.bundles.length, 1);
  assert.deepEqual(result.data.categories, ["progressive-disclosure"]);
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
