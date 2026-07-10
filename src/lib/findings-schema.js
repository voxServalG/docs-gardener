import fs from "fs";
import path from "path";

const ALLOWED_SEVERITY = new Set(["error", "warning", "note"]);
const ALLOWED_SUGGESTION = new Set(["manual", "replace_text"]);

export function validateFinding(bundle, finding, projectRoot) {
  if (!finding || typeof finding !== "object") {
    return { ok: false, reason: "finding-not-object" };
  }
  const required = ["rule", "severity", "confidence", "evidence", "suggestion"];
  for (const key of required) {
    if (!(key in finding)) return { ok: false, reason: `missing-field:${key}` };
  }
  if (!bundle.allowedRules.includes(finding.rule)) {
    return { ok: false, reason: `rule-not-allowed:${finding.rule}` };
  }
  if (!ALLOWED_SEVERITY.has(finding.severity)) {
    return { ok: false, reason: `bad-severity:${finding.severity}` };
  }
  if (typeof finding.confidence !== "number" || finding.confidence < 0 || finding.confidence > 1) {
    return { ok: false, reason: "bad-confidence" };
  }
  const evidence = finding.evidence || {};
  if (!evidence.docCitation || typeof evidence.docCitation !== "string") {
    return { ok: false, reason: "missing-docCitation" };
  }
  const suggestion = finding.suggestion || {};
  if (!ALLOWED_SUGGESTION.has(suggestion.type)) {
    return { ok: false, reason: `bad-suggestion-type:${suggestion.type}` };
  }
  if (typeof suggestion.text !== "string" || suggestion.text.length === 0) {
    return { ok: false, reason: "empty-suggestion-text" };
  }
  if (suggestion.type === "replace_text") {
    if (typeof evidence.oldText !== "string" || evidence.oldText.length === 0) {
      return { ok: false, reason: "replace_text-missing-oldText" };
    }
    if (typeof evidence.newText !== "string") {
      return { ok: false, reason: "replace_text-missing-newText" };
    }
    const file = extractFileFromCitation(evidence.docCitation);
    if (!file) return { ok: false, reason: "docCitation-not-parseable" };
    const abs = path.join(projectRoot, file);
    if (!fs.existsSync(abs)) return { ok: false, reason: `target-file-missing:${file}` };
    const content = fs.readFileSync(abs, "utf-8");
    if (!content.includes(evidence.oldText)) {
      return { ok: false, reason: "oldText-not-found-in-file" };
    }
  }
  return {
    ok: true,
    finding: {
      rule: finding.rule,
      severity: finding.severity,
      confidence: finding.confidence,
      evidence,
      suggestion,
    },
  };
}

export function extractFileFromCitation(citation) {
  if (typeof citation !== "string") return null;
  const idx = citation.lastIndexOf(":");
  if (idx <= 0) return citation;
  return citation.slice(0, idx);
}
