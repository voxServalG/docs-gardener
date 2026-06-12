import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("CLI default command prints usage", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["src/index.js"]);

  assert.match(stdout, /docs-gardener/);
  assert.match(stdout, /docs-gardener mcp/);
});
