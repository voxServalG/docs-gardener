import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("CLI default command prints usage", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js"]);

  assert.match(stdout, /docs-gardener/);
  assert.match(stdout, /docs-gardener mcp/);
  assert.match(stdout, /docs-gardener scan/);
  assert.match(stdout, /docs-gardener grow/);
});

test("CLI scan prints a JSON envelope", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js", "scan"]);
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.tool, "garden-scan");
  assert.equal(result.phase, "scan");
});

test("polish module can be imported", async () => {
  const module = await import("../src/lib/polish.js");

  assert.equal(typeof module.polish, "function");
});
