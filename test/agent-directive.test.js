import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentDirective, PROCESSING_CONTRACT, FORBIDDEN_TERMS, SOFT_RENDER_SCHEMA, HARD_RENDER_SCHEMA, COMBINED_RENDER_SCHEMA, USER_RENDER_TEMPLATE, NO_SOFT_REVIEW_TEMPLATE } from "../src/lib/agent-directive.js";

test("buildAgentDirective returns render contract with schema per kind", () => {
  for (const kind of ["hard", "soft", "combined"]) {
    const directive = buildAgentDirective(kind);
    assert.equal(directive.kind, kind);
    assert.equal(directive.renderRequired, true);
    assert.ok(Array.isArray(directive.processingContract));
    assert.ok(directive.processingContract.length > 0);
    assert.ok(directive.renderSchema);
    assert.ok(directive.forbiddenTerms);
    assert.ok(directive.userRenderTemplate);
  }
});

test("PROCESSING_CONTRACT enforces hard-code consumption and natural language", () => {
  const joined = PROCESSING_CONTRACT.join(" ").toLowerCase();
  assert.match(joined, /hard code/);
  assert.match(joined, /natural-language/);
  assert.match(joined, /do not use these internal terms/);
});

test("FORBIDDEN_TERMS includes bundle, rubric, pending, prose-claims, progressive-disclosure", () => {
  for (const term of ["bundle", "rubric", "pending", "prose-claims", "progressive-disclosure", "code-doc-consistency"]) {
    assert.ok(FORBIDDEN_TERMS.includes(term), `missing forbidden term: ${term}`);
  }
});

test("soft render schema requires countsBySeverity, findings, decisions", () => {
  const keys = SOFT_RENDER_SCHEMA.sections.map((s) => s.key);
  for (const required of ["countsBySeverity", "findings", "decisions"]) {
    assert.ok(keys.includes(required), `soft schema missing ${required}`);
  }
  assert.ok(SOFT_RENDER_SCHEMA.forbiddenTerms);
  assert.ok(SOFT_RENDER_SCHEMA.userRenderTemplate);
  assert.ok(SOFT_RENDER_SCHEMA.noSoftReviewTemplate);
});

test("hard render schema requires counts, hardErrors, decisions", () => {
  const keys = HARD_RENDER_SCHEMA.sections.map((s) => s.key);
  for (const required of ["counts", "hardErrors", "decisions"]) {
    assert.ok(keys.includes(required), `hard schema missing ${required}`);
  }
});

test("combined render schema has forbidden terms and user template", () => {
  assert.ok(COMBINED_RENDER_SCHEMA.forbiddenTerms);
  assert.ok(COMBINED_RENDER_SCHEMA.userRenderTemplate);
});

test("buildAgentDirective throws for unknown kind", () => {
  assert.throws(() => buildAgentDirective("weird"));
});

test("USER_RENDER_TEMPLATE uses natural language, not internal terms", () => {
  assert.match(USER_RENDER_TEMPLATE, /软扫描结果/);
  assert.match(USER_RENDER_TEMPLATE, /错误/);
  assert.match(USER_RENDER_TEMPLATE, /警告/);
  assert.match(USER_RENDER_TEMPLATE, /提示/);
  for (const term of FORBIDDEN_TERMS) {
    assert.ok(!USER_RENDER_TEMPLATE.toLowerCase().includes(term.toLowerCase()), `template leaks term: ${term}`);
  }
});

test("NO_SOFT_REVIEW_TEMPLATE is user-friendly", () => {
  assert.match(NO_SOFT_REVIEW_TEMPLATE, /未执行软扫描/);
  assert.match(NO_SOFT_REVIEW_TEMPLATE, /硬扫描/);
});
