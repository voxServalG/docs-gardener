import fs from "fs";
import path from "path";
import crypto from "crypto";
import { scanHard } from "./scan-hard.js";
import { buildBundles } from "./soft-bundles.js";
import { successEnvelope, errorEnvelope } from "./envelope.js";

const ALLOWED_SEVERITY = new Set(["error", "warning", "note"]);
const ALLOWED_SUGGESTION = new Set(["manual", "replace_text"]);

export function fixSoft(projectRoot, config, args = {}) {
  const reports = Array.isArray(args.reports) ? args.reports : [];
  const providedRef = typeof args.hardSummaryRef === "string" ? args.hardSummaryRef : null;

  if (reports.length === 0) {
    return errorEnvelope({
      tool: "garden-fix-soft",
      mode: "soft",
      phase: "fix-soft",
      param: "reports",
      message: "缺少必填参数: reports (LLM 回填的 findings 报告数组)",
      hint: "First run garden-scan-soft, ask the LLM to fill findings per bundle, then call garden-fix-soft with { hardSummaryRef, reports }.",
      allowedTools: ["garden-scan-soft"],
    });
  }

  const hardReport = scanHard(projectRoot, config).data;
  const currentRef = hashReport(hardReport);
  if (providedRef && providedRef !== currentRef) {
    return errorEnvelope({
      tool: "garden-fix-soft",
      mode: "soft",
      phase: "fix-soft",
      param: "hardSummaryRef",
      message: `hardSummaryRef 已过期: 期望 ${currentRef}, 收到 ${providedRef}`,
      hint: "Re-run garden-scan-soft to get bundles bound to the current hard scan digest.",
      allowedTools: ["garden-scan-soft"],
    });
  }

  const { bundles } = buildBundles(projectRoot, config, hardReport);
  const bundleById = new Map(bundles.map((b) => [b.id, b]));

  const accepted = [];
  const rejected = [];

  for (const report of reports) {
    const bundle = report && report.bundleId ? bundleById.get(report.bundleId) : null;
    if (!bundle) {
      rejected.push({
        bundleId: report ? report.bundleId : null,
        reason: "unknown-bundle-id",
        finding: report,
      });
      continue;
    }
    const findings = Array.isArray(report.findings) ? report.findings : [];
    for (const finding of findings) {
      const validation = validateFinding(bundle, finding, projectRoot);
      if (validation.ok) {
        accepted.push({ bundle: bundle.id, category: bundle.category, ...validation.finding });
      } else {
        rejected.push({
          bundleId: bundle.id,
          category: bundle.category,
          reason: validation.reason,
          finding,
        });
      }
    }
  }

  const plan = accepted.map((finding) => proposeSoftFix(finding));

  if (!args.approved) {
    return successEnvelope({
      tool: "garden-fix-soft",
      mode: "soft",
      phase: "fix-soft-plan",
      next: "garden-fix-soft",
      summary: {
        accepted: accepted.length,
        rejected: rejected.length,
        plannedFixes: plan.length,
      },
      data: {
        hardSummaryRef: currentRef,
        accepted,
        rejected,
        plan,
        approval: {
          required: true,
          message: "garden-fix-soft requires explicit approval before modifying files.",
        },
      },
      display: {
        title: accepted.length > 0 ? "Soft fix approval required" : "Soft findings triaged",
        body: accepted.length > 0
          ? `Accepted ${accepted.length} finding(s); rejected ${rejected.length}. Review the plan before applying.`
          : `No findings accepted. Rejected ${rejected.length} entries. Fix schema issues and resubmit.`,
      },
      hint: accepted.length > 0
        ? "Show the plan to the user. Call garden-fix-soft again with approved=true only after approval."
        : "Return the rejected list to the LLM; regenerate findings that comply with findingSchema.",
      requires_user: true,
      stop_here: true,
      allowedTools: ["garden-fix-soft", "garden-polish"],
    });
  }

  const applied = [];
  for (const item of plan) {
    if (item.action !== "replace_text") continue;
    const fullPath = path.join(projectRoot, item.file);
    if (!fs.existsSync(fullPath)) {
      return errorEnvelope({
        tool: "garden-fix-soft",
        mode: "soft",
        phase: "apply",
        message: `文件不存在: ${item.file}`,
        hint: "Re-run garden-scan-soft and produce fresh findings.",
      });
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    if (!content.includes(item.oldText)) {
      return errorEnvelope({
        tool: "garden-fix-soft",
        mode: "soft",
        phase: "apply",
        message: `编辑失败: ${item.file} 中找不到匹配文本`,
        hint: "Re-run garden-scan-soft and produce fresh findings.",
      });
    }
    fs.writeFileSync(fullPath, content.replace(item.oldText, item.newText));
    applied.push(item);
  }

  return successEnvelope({
    tool: "garden-fix-soft",
    mode: "soft",
    phase: "apply",
    next: "garden-polish",
    summary: {
      applied: applied.length,
      remainingManual: plan.length - applied.length,
    },
    data: { applied, rejected },
    display: {
      title: "Soft fix applied",
      body: `Applied ${applied.length} replace_text fix(es). Remaining manual items: ${plan.length - applied.length}.`,
    },
    hint: "Continue with garden-polish for per-document prose review.",
    allowedTools: ["garden-polish"],
  });
}

function validateFinding(bundle, finding, projectRoot) {
  if (!finding || typeof finding !== "object") {
    return { ok: false, reason: "finding-not-object" };
  }
  const required = ["rule", "severity", "confidence", "evidence", "suggestion"];
  for (const key of required) {
    if (!(key in finding)) {
      return { ok: false, reason: `missing-field:${key}` };
    }
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

function proposeSoftFix(finding) {
  const file = extractFileFromCitation(finding.evidence.docCitation);
  if (finding.suggestion.type === "replace_text") {
    return {
      action: "replace_text",
      file,
      oldText: finding.evidence.oldText,
      newText: finding.evidence.newText,
      reason: finding.suggestion.text,
      rule: finding.rule,
      severity: finding.severity,
      confidence: finding.confidence,
      bundle: finding.bundle,
    };
  }
  return {
    action: "manual",
    file,
    reason: finding.suggestion.text,
    rule: finding.rule,
    severity: finding.severity,
    confidence: finding.confidence,
    bundle: finding.bundle,
    instruction: finding.suggestion.text,
  };
}

function extractFileFromCitation(citation) {
  if (typeof citation !== "string") return null;
  const idx = citation.lastIndexOf(":");
  if (idx <= 0) return citation;
  return citation.slice(0, idx);
}

function hashReport(report) {
  const payload = JSON.stringify({
    summary: report.summary || {},
    hardErrors: report.hardErrors || [],
    coverage: report.coverage
      ? {
          documented: (report.coverage.documented || []).map((s) => s.name),
          undocumented: (report.coverage.undocumented || []).map((s) => s.name),
        }
      : null,
    files: (report.files || []).map((f) => ({ path: f.path, lineCount: f.lineCount })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 12);
}
