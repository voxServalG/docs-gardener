import fs from "fs";
import path from "path";
import { successEnvelope, errorEnvelope } from "./envelope.js";
import { getProject, markRendered, setFindings } from "./state.js";
import { validateFinding, extractFileFromCitation } from "./findings-schema.js";

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

  const submittedFindings = Array.isArray(args.findings);
  const renderPending = collectRenderPending(project);
  if (submittedFindings) {
    for (const kind of renderPending) markRendered(projectRoot, kind);
    renderPending.length = 0;
  }
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

  if (submittedFindings && project.soft) {
    const bundleById = new Map((project.soft.envelope?.data?.bundles || []).map((b) => [b.id, b]));
    const accepted = [];
    const rejected = [];
    for (const report of args.findings) {
      const bundle = report && report.bundleId ? bundleById.get(report.bundleId) : null;
      if (!bundle) {
        rejected.push({ bundleId: report ? report.bundleId : null, reason: "unknown-bundle-id", finding: report });
        continue;
      }
      const items = Array.isArray(report.findings) ? report.findings : [];
      for (const finding of items) {
        const validation = validateFinding(bundle, finding, projectRoot);
        if (validation.ok) {
          accepted.push({ bundle: bundle.id, category: bundle.category, ...validation.finding });
        } else {
          rejected.push({ bundleId: bundle.id, category: bundle.category, reason: validation.reason, finding });
        }
      }
    }
    setFindings(projectRoot, { accepted, rejected });
  }

  const refreshed = getProject(projectRoot);
  const hardEnvelopeData = refreshed.hard ? refreshed.hard.envelope.data : null;
  const softFindings = refreshed.soft ? (refreshed.soft.findings || []) : [];
  const softRejected = refreshed.soft ? (refreshed.soft.rejected || []) : [];

  if (refreshed.soft && !Array.isArray(refreshed.soft.findings)) {
    return errorEnvelope({
      tool: "garden-fix",
      mode: "combined",
      phase: "fix",
      param: "findings",
      message: "最新软扫描的 bundle 尚未被判读。请按 agentDirective 读取 data.bundles、逐个判读、生成 findings，再以 { findings } 传入 garden-fix。",
      hint: "Read bundles from the scan-soft envelope, judge each per findingSchema, then call garden-fix with { findings: [{ bundleId, findings: [...] }] }.",
      allowedTools: ["garden-fix", "garden-scan-soft"],
    });
  }

  const hardPlan = hardEnvelopeData ? planHard(hardEnvelopeData.hardErrors || []) : [];
  const softPlan = softFindings.map((finding) => planSoftFix(finding));
  const plan = [...hardPlan, ...softPlan];

  if (plan.length === 0) {
    return successEnvelope({
      tool: "garden-fix",
      mode: "combined",
      phase: "fix",
      next: "garden-polish",
      summary: { hardPlan: 0, softPlan: 0, softRejected: softRejected.length },
      data: { hardPlan: [], softPlan: [], rejected: softRejected },
      display: {
        title: "No fixable items",
        body: `Hard errors: 0. Soft findings: 0. Rejected: ${softRejected.length}.`,
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
    return { action: "manual", layer: "hard", file: finding.file, reason: finding.message, instruction: "Update or remove the broken Markdown link after checking the intended target.", rule: finding.rule };
  }
  if (finding.rule === "dead-reference" && finding.reference && finding.file) {
    return { action: "manual", layer: "hard", file: finding.file, reason: finding.message, instruction: "Update or remove the dead code reference after checking the current source path.", rule: finding.rule };
  }
  if (finding.rule === "missing-docs-dir") {
    return { action: "manual", layer: "hard", file: finding.file || ".", reason: finding.message, instruction: "Create the configured docsDir or run garden-grow if this is an empty documentation system.", rule: finding.rule };
  }
  if (finding.rule === "has-reference" && finding.file) {
    return { action: "manual", layer: "hard", file: "docs/index.md", reason: finding.message, instruction: `Add an entry link to ${finding.file} from the documentation index if the document should be part of the public docs.`, rule: finding.rule };
  }
  return { action: "manual", layer: "hard", file: finding.file || ".", reason: finding.message, instruction: "Review this hard error and create an exact edit before applying.", rule: finding.rule };
}

function planSoftFix(finding) {
  const file = extractFileFromCitation(finding.evidence.docCitation);
  if (finding.suggestion.type === "replace_text") {
    return { action: "replace_text", layer: "soft", file, oldText: finding.evidence.oldText, newText: finding.evidence.newText, reason: finding.suggestion.text, rule: finding.rule, severity: finding.severity, confidence: finding.confidence, bundle: finding.bundle };
  }
  return { action: "manual", layer: "soft", file, reason: finding.suggestion.text, rule: finding.rule, severity: finding.severity, confidence: finding.confidence, bundle: finding.bundle, instruction: finding.suggestion.text };
}
