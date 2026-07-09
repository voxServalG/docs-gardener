import fs from "fs";
import path from "path";
import { scanHard } from "./scan-hard.js";
import { successEnvelope, errorEnvelope } from "./envelope.js";

export function fixHard(projectRoot, config, args = {}) {
  const report = args.report || scanHard(projectRoot, config).data;
  const hardErrors = collectHardErrors(report);

  if (hardErrors.length === 0) {
    return successEnvelope({
      tool: "garden-fix-hard",
      mode: "hard",
      phase: "fix-hard",
      next: "garden-scan-soft",
      summary: { hardErrors: 0, plannedFixes: 0 },
      data: { plan: [], hardErrors: [] },
      display: {
        title: "No hard errors",
        body: "garden-scan-hard did not report hard errors for garden-fix-hard to handle.",
      },
      hint: "Continue with garden-scan-soft to prepare LLM review bundles.",
      allowedTools: ["garden-scan-soft"],
    });
  }

  const plan = hardErrors.map((finding) => proposedFix(projectRoot, finding));

  if (!args.approved) {
    return successEnvelope({
      tool: "garden-fix-hard",
      mode: "hard",
      phase: "fix-hard-plan",
      next: "garden-fix-hard",
      summary: {
        hardErrors: hardErrors.length,
        plannedFixes: plan.length,
      },
      data: {
        hardErrors,
        plan,
        approval: {
          required: true,
          message: "garden-fix-hard requires explicit approval before modifying files.",
        },
      },
      display: {
        title: "Fix approval required",
        body: `Found ${hardErrors.length} hard error(s). Review the fix plan before applying changes.`,
      },
      hint: "Show the returned plan to the user. Call garden-fix-hard again with approved=true only after user approval.",
      requires_user: true,
      stop_here: true,
      allowedTools: ["garden-fix-hard"],
      blockedTools: ["garden-scan-soft"],
    });
  }

  const applied = [];
  for (const item of plan) {
    if (item.action !== "replace_text") continue;
    const fullPath = path.join(projectRoot, item.file);
    if (!fs.existsSync(fullPath)) {
      return errorEnvelope({
        tool: "garden-fix-hard",
        mode: "hard",
        phase: "apply",
        message: `文件不存在: ${item.file}`,
        hint: "Re-run garden-scan-hard and generate a fresh fix plan.",
      });
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    if (!content.includes(item.oldText)) {
      return errorEnvelope({
        tool: "garden-fix-hard",
        mode: "hard",
        phase: "apply",
        message: `编辑失败: ${item.file} 中找不到匹配文本`,
        hint: "Re-run garden-scan-hard and generate a fresh fix plan.",
      });
    }
    fs.writeFileSync(fullPath, content.replace(item.oldText, item.newText));
    applied.push(item);
  }

  const after = scanHard(projectRoot, config).data.summary.hardErrors;
  return successEnvelope({
    tool: "garden-fix-hard",
    mode: "hard",
    phase: "apply",
    next: after === 0 ? "garden-scan-soft" : "garden-fix-hard",
    summary: {
      applied: applied.length,
      remainingHardErrors: after,
    },
    data: { applied },
    display: {
      title: "Hard fix applied",
      body: `Applied ${applied.length} fix(es). Remaining hard errors: ${after}.`,
    },
    hint: after === 0
      ? "All hard errors resolved. Continue with garden-scan-soft."
      : "Some hard errors remain. Re-run garden-fix-hard.",
    allowedTools: after === 0 ? ["garden-scan-soft"] : ["garden-fix-hard"],
  });
}

function collectHardErrors(report) {
  if (!report) return [];
  if (Array.isArray(report.hardErrors)) return report.hardErrors;
  if (!Array.isArray(report.files)) return [];
  return report.files.flatMap((file) =>
    (file.mechanicalIssues || [])
      .filter((issue) => issue.severity === "error")
      .map((issue) => ({ ...issue, file: file.path }))
  );
}

function proposedFix(projectRoot, finding) {
  if (finding.rule === "dead-link" && finding.target && finding.file) {
    return {
      action: "manual",
      file: finding.file,
      reason: finding.message,
      instruction: "Update or remove the broken Markdown link after checking the intended target.",
    };
  }
  if (finding.rule === "dead-reference" && finding.reference && finding.file) {
    return {
      action: "manual",
      file: finding.file,
      reason: finding.message,
      instruction: "Update or remove the dead code reference after checking the current source path.",
    };
  }
  if (finding.rule === "missing-docs-dir") {
    return {
      action: "manual",
      file: finding.file || ".",
      reason: finding.message,
      instruction: "Create the configured docsDir or run garden-grow if this is an empty documentation system.",
    };
  }
  if (finding.rule === "has-reference" && finding.file) {
    return {
      action: "manual",
      file: "docs/index.md",
      reason: finding.message,
      instruction: `Add an entry link to ${finding.file} from the documentation index if the document should be part of the public docs.`,
    };
  }

  return {
    action: "manual",
    file: finding.file || ".",
    reason: finding.message,
    instruction: "Review this hard error and create an exact edit before applying.",
  };
}
