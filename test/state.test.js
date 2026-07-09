import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getProject,
  markScan,
  markRendered,
  setFindings,
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
  markScan(root, "soft", { data: {} }, "s1");
  setFindings(root, [{ bundleId: "x", findings: [] }]);
  let project = getProject(root);
  assert.equal(project.soft.hash, "s1");
  assert.ok(project.findings);

  markScan(root, "hard", { data: {} }, "h2");
  project = getProject(root);
  assert.equal(project.hard.hash, "h2");
  assert.equal(project.soft, null);
  assert.equal(project.findings, null);
});

test("setFindings binds to current soft hash", () => {
  isolate();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-project-"));
  const missing = setFindings(root, [{ bundleId: "x", findings: [] }]);
  assert.equal(missing.updated, false);

  markScan(root, "hard", { data: {} }, "h1");
  markScan(root, "soft", { data: {} }, "s1");
  setFindings(root, [{ bundleId: "b1", findings: [{ rule: "note" }] }]);

  const project = getProject(root);
  assert.equal(project.findings.hardSummaryRef, "s1");
  assert.equal(project.findings.reports[0].bundleId, "b1");
});

test("state persists across separate calls in the same directory", () => {
  isolate();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dg-project-"));
  markScan(root, "hard", { data: {} }, "keep");

  resetMemoryFallback();
  const later = getProject(root);
  assert.equal(later.hard.hash, "keep");
});
