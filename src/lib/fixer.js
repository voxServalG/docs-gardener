import fs from "fs";
import path from "path";
import { scan } from "./scanner.js";
import { successEnvelope, errorEnvelope } from "./envelope.js";

export function fix(projectRoot, config, args = {}) {
  const report = args.report || scan(projectRoot, config).data;
  const hardErrors = collectHardErrors(report);

  if (hardErrors.length === 0) {
    return successEnvelope({
      tool: "garden-fix",
      mode: "hard",
      phase: "fix",
      next: "garden-polish",
      summary: { hardErrors: 0, plannedFixes: 0 },
      data: { plan: [], hardErrors: [] },
      display: {
        title: "No hard errors",
        body: "garden-scan did not report hard errors for garden-fix to handle.",
      },
      hint: "Continue with garden-polish for style and wording review.",
      allowedTools: ["garden-polish"],
    });
  }

  const plan = hardErrors.map((finding) => proposedFix(projectRoot, finding));

  if (!args.approved) {
    return successEnvelope({
      tool: "garden-fix",
      mode: "hard",
      phase: "fix-plan",
      next: "garden-fix",
      summary: {
        hardErrors: hardErrors.length,
        plannedFixes: plan.length,
      },
      data: {
        hardErrors,
        plan,
        approval: {
          required: true,
          message: "garden-fix requires explicit approval before modifying files.",
        },
      },
      display: {
        title: "Fix approval required",
        body: `Found ${hardErrors.length} hard error(s). Review the fix plan before applying changes.`,
      },
      hint: "Show the returned plan to the user. Call garden-fix again with approved=true only after user approval.",
      requires_user: true,
      stop_here: true,
      allowedTools: ["garden-fix"],
      blockedTools: ["garden-polish"],
    });
  }

  const applied = [];
  for (const item of plan) {
    if (item.action !== "replace_text") continue;
    const fullPath = path.join(projectRoot, item.file);
    if (!fs.existsSync(fullPath)) {
      return errorEnvelope({
        tool: "garden-fix",
        mode: "hard",
        phase: "apply",
        message: `文件不存在: ${item.file}`,
        hint: "Re-run garden-scan and generate a fresh fix plan.",
      });
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    if (!content.includes(item.oldText)) {
      return errorEnvelope({
        tool: "garden-fix",
        mode: "hard",
        phase: "apply",
        message: `编辑失败: ${item.file} 中找不到匹配文本`,
        hint: "Re-run garden-scan and generate a fresh fix plan.",
      });
    }
    fs.writeFileSync(fullPath, content.replace(item.oldText, item.newText));
    applied.push(item);
  }

  const after = scan(projectRoot, config).data.summary.hardErrors;
  return successEnvelope({
    tool: "garden-fix",
    mode: "hard",
    phase: "apply",
    next: after === 0 ? "garden-polish" : "garden-fix",
    summary: {
      applied: applied.length,
      remainingHardErrors: after,
    },
    data: { applied },
    display: {
      title: "Fix applied",
      body: `Applied ${applied.length} fix(es). Remaining hard errors: ${after}.`,
    },
    hint: "Review the updated scan result before continuing.",
    allowedTools: after === 0 ? ["garden-polish"] : ["garden-fix"],
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
