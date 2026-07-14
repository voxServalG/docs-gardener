import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("npm package is scoped, directly runnable, and source-only", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "@voxserval/docs-gardener");
  assert.equal(pkg.bin?.["docs-gardener"], "./src/index.js");
  assert.equal(pkg.publishConfig?.access, "public");
  assert.equal(pkg.repository?.url, "git+https://github.com/voxServalG/docs-gardener.git");
  assert.equal(pkg.scripts?.prepublishOnly, "npm run verify");
  for (const lifecycle of ["prepare", "install", "postinstall"]) {
    assert.equal(pkg.scripts?.[lifecycle], undefined, `${lifecycle} must not build on install`);
  }

  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  assert.equal(tracked.some((file) => file.startsWith("dist/")), false);

  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
  }))[0].files.map((file) => file.path);
  assert(packed.includes("src/index.js"));
  assert(packed.includes("index.d.ts"));
  assert.equal(packed.some((file) => file.startsWith("test/")), false);
  assert.equal(packed.some((file) => file.startsWith(".github/")), false);
});

test("npm publish uses OIDC and never uploads a GitHub build artifact", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/npm-publish.yml"), "utf8");
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npm publish --access public --tag next/);
  assert.match(workflow, /npm publish --access public --tag latest/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.doesNotMatch(workflow, /upload-artifact|gh release upload|actions\/attest-build-provenance/);
});
