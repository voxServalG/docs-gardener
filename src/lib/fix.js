import fs from "fs";
import path from "path";
import { successEnvelope, errorEnvelope } from "./envelope.js";
import { getProject, setFindings, markRendered } from "./state.js";

const ALLOWED_SEVERITY = new Set(["error", "warning", "note"]);
const ALLOWED_SUGGESTION = new Set(["manual", "replace_text"]);

export function fix(projectRoot, config, args = {}) {
  const forceRenderAck = args.forceRenderAck === true;
  const project = getProject(projectRoot);

  if (!project.hard && !project.soft) {
    return errorEnvelope({
      tool: "garden-fix",
      mode: "combined",
      phase: "fix",
      param: "state",
      message: "缓存中没有 scan 结果。先运行 garden-scan（或 garden-scan-hard / garden-scan-soft）。",
      hint: "Run garden-scan to populate hard and soft scan caches before calling garden-fix.",
      allowedTools: ["garden-scan", "garden-scan-hard"],
    });
  }

  const renderPending = collectRenderPending(project);
  if (renderPending.length > 0 && !forceRenderAck) {
    return errorEnvelope({
      tool: "garden-fix",
      mode: "combined",
      phase: "fix",
      param: "agentDirective",
      message: `最新 scan 尚未按 agentDirective 渲染: ${renderPending.join(", ")}`,
      hint: "Render the pending scan envelope for the user, then retry garden-fix. Automation may pass forceRenderAck=true.",
      allowedTools: ["garden-scan", "garden-scan-hard", "garden-scan-soft"],
    });
  }
  if (forceRenderAck) {
    for (const kind of renderPending) markRendered(projectRoot, kind);
  }

  if (Array.isArray(args.findings) && project.soft) {
    setFindings(projectRoot, args.findings);
  }

  const refreshed = getProject(projectRoot);
  const softNeedsFindings = Boolean(refreshed.soft) && (!refreshed.findings || refreshed.findings.hardSummaryRef !== refreshed.soft.hash);
  if (softNeedsFindings) {
    return errorEnvelope({
      tool: "garden-fix",
      mode: "combined",
      phase: "fix",
      param: "findings",
      message: "最新 soft scan 尚未补全 findings。请让 LLM 按 bundle 生成 findings，再以 { findings } 传入 garden-fix。",
      hint: "Call garden-fix with { findings: [{ bundleId, findings: [...] }] } once LLM has processed the bundles.",
      allowedTools: ["garden-fix", "garden-scan-soft"],
    });
  }

  const hardEnvelopeData = refreshed.hard ? refreshed.hard.envelope.data : null;
  const softBundles = refreshed.soft ? refreshed.soft.envelope.data.bundles : [];
  const bundleById = new Map(softBundles.map((b) => [b.id, b]));

  const hardPlan = hardEnvelopeData ? planHard(hardEnvelopeData.hardErrors || []) : [];
  const softAccepted = [];
  const softRejected = [];
  const findings = refreshed.findings ? refreshed.findings.reports : [];
  for (const report of findings) {
    const bundle = report && report.bundleId ? bundleById.get(report.bundleId) : null;
    if (!bundle) {
      softRejected.push({ bundleId: report ? report.bundleId : null, reason: "unknown-bundle-id", finding: report });
      continue;
    }
    const items = Array.isArray(report.findings) ? report.findings : [];
    for (const finding of items) {
      const validation = validateFinding(bundle, finding, projectRoot);
      if (validation.ok) {
        softAccepted.push({ bundle: bundle.id, category: bundle.category, ...validation.finding });
      } else {
        softRejected.push({ bundleId: bundle.id, category: bundle.category, reason: validation.reason, finding });
      }
    }
  }
  const softPlan = softAccepted.map((finding) => planSoftFix(finding));

  const plan = [...hardPlan, ...softPlan];
  if (plan.length === 0) {
    return successEnvelope({
      tool: "garden-fix",
      mode: "combined",
      phase: "fix",
      next: "garden-polish",
      summary: { hardPlan: 0, softPlan: 0, softRejected: softRejected.length },
      data: {
        hardPlan: [],
        softPlan: [],
        rejected: softRejected,
      },
      display: {
        title: "No fixable items",
        body: `Hard errors: 0. Soft findings accepted: 0. Rejected: ${softRejected.length}.`,
      },
      hint: "Continue with garden-polish for per-document prose review.",
      allowedTools: ["garden-polish"],
    });
  }

  if (!args.approved) {
    return successEnvelope({
      tool: "garden-fix",
      mode: "combined",
      phase: "fix-plan",
      next: "garden-fix",
      summary: {
        hardPlan: hardPlan.length,
        softPlan: softPlan.length,
        softRejected: softRejected.length,
      },
      data: {
        hardPlan,
        softPlan,
        rejected: softRejected,
        approval: {
          required: true,
          message: "garden-fix requires explicit approval before modifying files.",
        },
      },
      display: {
        title: "Fix approval required",
        body: `Hard plan: ${hardPlan.length}. Soft plan: ${softPlan.length}. Rejected: ${softRejected.length}. Review the plan before applying.`,
      },
      hint: "Show the plan to the user. Call garden-fix again with approved=true only after approval.",
      requires_user: true,
      stop_here: true,
      allowedTools: ["garden-fix", "garden-polish"],
    });
  }

  const applied = [];
  for (const item of plan) {
    if (item.action !== "replace_text") continue;
    const fullPath = path.join(projectRoot, item.file);
    if (!fs.existsSync(fullPath)) {
      return errorEnvelope({
        tool: "garden-fix",
        mode: "combined",
        phase: "apply",
        message: `文件不存在: ${item.file}`,
        hint: "Re-run garden-scan and produce fresh evidence.",
      });
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    if (!content.includes(item.oldText)) {
      return errorEnvelope({
        tool: "garden-fix",
        mode: "combined",
        phase: "apply",
        message: `编辑失败: ${item.file} 中找不到匹配文本`,
        hint: "Re-run garden-scan and produce fresh evidence.",
      });
    }
    fs.writeFileSync(fullPath, content.replace(item.oldText, item.newText));
    applied.push(item);
  }

  return successEnvelope({
    tool: "garden-fix",
    mode: "combined",
    phase: "apply",
    next: "garden-polish",
    summary: {
      applied: applied.length,
      remainingManual: plan.length - applied.length,
      softRejected: softRejected.length,
    },
    data: { applied, rejected: softRejected },
    display: {
      title: "Fix applied",
      body: `Applied ${applied.length} replace_text fix(es). Remaining manual items: ${plan.length - applied.length}.`,
    },
    hint: "Continue with garden-polish for per-document prose review.",
    allowedTools: ["garden-polish"],
  });
}

function collectRenderPending(project) {
  const pending = [];
  if (project.hard && project.hard.rendered !== true) pending.push("hard");
  if (project.soft && project.soft.rendered !== true) pending.push("soft");
  return pending;
}

function planHard(hardErrors) {
  return hardErrors.map((finding) => proposedHardFix(finding));
}

function proposedHardFix(finding) {
  if (finding.rule === "dead-link" && finding.target && finding.file) {
    return {
      action: "manual",
      layer: "hard",
      file: finding.file,
      reason: finding.message,
      instruction: "Update or remove the broken Markdown link after checking the intended target.",
      rule: finding.rule,
    };
  }
  if (finding.rule === "dead-reference" && finding.reference && finding.file) {
    return {
      action: "manual",
      layer: "hard",
      file: finding.file,
      reason: finding.message,
      instruction: "Update or remove the dead code reference after checking the current source path.",
      rule: finding.rule,
    };
  }
  if (finding.rule === "missing-docs-dir") {
    return {
      action: "manual",
      layer: "hard",
      file: finding.file || ".",
      reason: finding.message,
      instruction: "Create the configured docsDir or run garden-grow if this is an empty documentation system.",
      rule: finding.rule,
    };
  }
  if (finding.rule === "has-reference" && finding.file) {
    return {
      action: "manual",
      layer: "hard",
      file: "docs/index.md",
      reason: finding.message,
      instruction: `Add an entry link to ${finding.file} from the documentation index if the document should be part of the public docs.`,
      rule: finding.rule,
    };
  }
  return {
    action: "manual",
    layer: "hard",
    file: finding.file || ".",
    reason: finding.message,
    instruction: "Review this hard error and create an exact edit before applying.",
    rule: finding.rule,
  };
}

function planSoftFix(finding) {
  const file = extractFileFromCitation(finding.evidence.docCitation);
  if (finding.suggestion.type === "replace_text") {
    return {
      action: "replace_text",
      layer: "soft",
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
    layer: "soft",
    file,
    reason: finding.suggestion.text,
    rule: finding.rule,
    severity: finding.severity,
    confidence: finding.confidence,
    bundle: finding.bundle,
    instruction: finding.suggestion.text,
  };
}

function validateFinding(bundle, finding, projectRoot) {
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

function extractFileFromCitation(citation) {
  if (typeof citation !== "string") return null;
  const idx = citation.lastIndexOf(":");
  if (idx <= 0) return citation;
  return citation.slice(0, idx);
}
