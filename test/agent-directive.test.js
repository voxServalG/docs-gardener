import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentDirective, PROCESSING_CONTRACT, HARD_RENDER_SCHEMA, SOFT_RENDER_SCHEMA } from "../src/lib/agent-directive.js";

test("buildAgentDirective returns render contract with schema per kind", () => {
  for (const kind of ["hard", "soft", "combined"]) {
    const directive = buildAgentDirective(kind);
    assert.equal(directive.kind, kind);
    assert.equal(directive.renderRequired, true);
    assert.ok(Array.isArray(directive.processingContract));
    assert.ok(directive.processingContract.length > 0);
    assert.ok(directive.renderSchema);
  }
});

test("PROCESSING_CONTRACT enforces hard-code consumption and no compression", () => {
  const joined = PROCESSING_CONTRACT.join(" ").toLowerCase();
  assert.match(joined, /hard code/);
  assert.match(joined, /do not omit|do not compress|do not editorialize/);
  assert.match(joined, /acknowledge/);
});

test("hard render schema requires counts, diff, decisions sections", () => {
  const keys = HARD_RENDER_SCHEMA.sections.map((s) => s.key);
  for (const required of ["counts", "hardErrors", "diff", "decisions"]) {
    assert.ok(keys.includes(required), `hard schema missing ${required}`);
  }
});

test("soft render schema requires bundles and findings status", () => {
  const keys = SOFT_RENDER_SCHEMA.sections.map((s) => s.key);
  for (const required of ["bundles", "findingsStatus", "diff", "decisions"]) {
    assert.ok(keys.includes(required), `soft schema missing ${required}`);
  }
});

test("buildAgentDirective throws for unknown kind", () => {
  assert.throws(() => buildAgentDirective("weird"));
});
