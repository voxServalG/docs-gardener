import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function envWithIsolatedState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-gardener-state-"));
  return { ...process.env, DOCS_GARDENER_STATE_DIR: dir };
}

test("CLI default command prints usage", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js"]);

  assert.match(stdout, /docs-gardener/);
  assert.match(stdout, /docs-gardener mcp/);
  assert.match(stdout, /docs-gardener scan\b/);
  assert.match(stdout, /docs-gardener scan-hard/);
  assert.match(stdout, /docs-gardener scan-soft/);
  assert.match(stdout, /docs-gardener fix/);
  assert.match(stdout, /docs-gardener polish/);
  assert.match(stdout, /docs-gardener grow/);
});

test("CLI scan-hard prints a JSON envelope with agentDirective", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js", "scan-hard"], {
    env: envWithIsolatedState(),
  });
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-hard");
  assert.equal(result.phase, "scan-hard");
  assert.equal(result.data.agentDirective.renderRequired, true);
  assert.ok(Array.isArray(result.data.agentDirective.processingContract));
});

test("CLI scan-soft returns empty findings with sampling warning", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js", "scan-soft"], {
    env: envWithIsolatedState(),
    maxBuffer: 20 * 1024 * 1024,
  });
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-soft");
  assert.ok(Array.isArray(result.data.findings));
  assert.equal(result.data.findings.length, 0);
  assert.equal(result.data.bundles, undefined);
  assert.ok(result.warnings);
  assert.ok(result.warnings.some((w) => w.includes("sampling-unavailable")));
  assert.equal(result.data.agentDirective.renderRequired, true);
});

test("CLI scan returns combined envelope", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js", "scan"], {
    env: envWithIsolatedState(),
    maxBuffer: 20 * 1024 * 1024,
  });
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan");
  assert.equal(result.mode, "combined");
  assert.ok(result.data.hard);
  assert.ok(result.data.soft);
  assert.ok(result.data.soft.data.findings);
  assert.equal(result.data.soft.data.bundles, undefined);
  assert.equal(result.data.agentDirective.renderRequired, true);
});

test("polish module can be imported", async () => {
  const module = await import("../src/lib/polish.js");

  assert.equal(typeof module.polish, "function");
});
