import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { grow } from "../src/lib/grow.js";

test("grow is available when docsDir is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-gardener-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "demo" }));

  const result = grow(root, config());

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-grow");
  assert.equal(result.data.available, true);
  assert.ok(result.data.suggestedFiles.some((file) => file.role === "index"));
  assert.ok(result.data.agentContract.some((item) => item.includes("Do not invent")));
});

test("grow is unavailable when docsDir contains Markdown", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-gardener-"));
  const docs = path.join(root, "docs");
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, "index.md"), "# Docs\n");

  const result = grow(root, config());

  assert.equal(result.ok, true);
  assert.equal(result.data.available, false);
  assert.equal(result.next, "garden-scan-hard");
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
