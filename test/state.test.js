import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getProject,
  markScan,
  markRendered,
  resetMemoryFallback,
  stateFilePath,
} from "../src/lib/state.js";

function isolate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-gardener-state-"));
  process.env.DOCS_GARDENER_STATE_DIR = dir;
  resetMemoryFallback();
  return dir;
}

test("state file honors DOCS_GARDENER_STATE_DIR", () => {
  const dir = isolate();
  assert.equal(stateFilePath(), path.join(dir, "state.json"));
});

test("markScan writes per-project record; markRendered flips flag", () => {
  isolate();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-project-"));
  const envelope = { data: { hash: "abc123" } };
  markScan(root, "hard", envelope, "abc123");

  let project = getProject(root);
  assert.equal(project.hard.hash, "abc123");
  assert.equal(project.hard.rendered, false);

  markRendered(root, "hard");
  project = getProject(root);
  assert.equal(project.hard.rendered, true);
  assert.equal(typeof project.hard.renderedAt, "string");
});

test("new hard scan resets soft and findings", () => {
  isolate();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-project-"));
  markScan(root, "hard", { data: {} }, "h1");
  markScan(root, "soft", { data: {} }, "s1", { findings: [{ rule: "test" }], rejected: [] });
  let project = getProject(root);
  assert.equal(project.soft.hash, "s1");
  assert.ok(project.soft.findings);

  markScan(root, "hard", { data: {} }, "h2");
  project = getProject(root);
  assert.equal(project.hard.hash, "h2");
  assert.equal(project.soft, null);
});

test("state persists across separate calls in the same directory", () => {
  isolate();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-project-"));
  markScan(root, "hard", { data: {} }, "keep");

  resetMemoryFallback();
  const later = getProject(root);
  assert.equal(later.hard.hash, "keep");
});

test("soft scan record stores findings and rejected", () => {
  isolate();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-project-"));
  markScan(root, "hard", { data: {} }, "h1");
  markScan(root, "soft", { data: {} }, "s1", {
    findings: [{ rule: "claim-overreaches", severity: "warning" }],
    rejected: [{ bundleId: "x", reason: "bad" }],
    summary: { countsBySeverity: { error: 0, warning: 1, note: 0, total: 1 } },
  });

  const project = getProject(root);
  assert.ok(project.soft.findings);
  assert.equal(project.soft.findings.length, 1);
  assert.ok(project.soft.rejected);
  assert.equal(project.soft.rejected.length, 1);
  assert.ok(project.soft.summary);
});
