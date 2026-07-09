import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("CLI default command prints usage", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js"]);

  assert.match(stdout, /docs-gardener/);
  assert.match(stdout, /docs-gardener mcp/);
  assert.match(stdout, /docs-gardener scan-hard/);
  assert.match(stdout, /docs-gardener scan-soft/);
  assert.match(stdout, /docs-gardener fix-hard/);
  assert.match(stdout, /docs-gardener fix-soft/);
  assert.match(stdout, /docs-gardener grow/);
});

test("CLI scan-hard prints a JSON envelope", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js", "scan-hard"]);
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-hard");
  assert.equal(result.phase, "scan-hard");
});

test("CLI scan-soft prints a JSON envelope with bundles", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js", "scan-soft"], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan-soft");
  assert.equal(result.mode, "soft");
  assert.ok(Array.isArray(result.data.bundles));
  assert.ok(result.data.bundles.length > 0);
});

test("polish module can be imported", async () => {
  const module = await import("../src/lib/polish.js");

  assert.equal(typeof module.polish, "function");
});
