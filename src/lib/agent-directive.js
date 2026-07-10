export const DIRECTIVE_VERSION = 2;

export const FORBIDDEN_TERMS = [
  "bundle",
  "rubric",
  "pending",
  "finding",
  "prose-claims",
  "progressive-disclosure",
  "code-doc-consistency",
];

export const PROCESSING_CONTRACT = [
  "Consume this envelope with hard code, not free-form paraphrase.",
  "Render the findings as a natural-language problem list the user can act on.",
  "Do NOT use these internal terms in user-facing output: " + FORBIDDEN_TERMS.join(", ") + ".",
  "Group by severity (error first, then warning, then note).",
  "For each item, state: where (file:line range), what is wrong, and what to do.",
  "If there are zero findings, say so explicitly — do not leave the user guessing.",
  "After listing, state the next step: call garden-fix to apply fixes, or garden-polish for prose review.",
];

export const USER_RENDER_TEMPLATE = [
  "## 软扫描结果",
  "",
  "共发现 {count} 个问题：",
  "",
  "### 错误（{error}）",
  "- {location}: {message} → {suggestion}",
  "",
  "### 警告（{warning}）",
  "- {location}: {message} → {suggestion}",
  "",
  "### 提示（{note}）",
  "- {location}: {message} → {suggestion}",
  "",
  "下一步：调用 garden-fix 修复，或 garden-polish 做文档润色。",
].join("\n");

export const NO_SOFT_REVIEW_TEMPLATE = [
  "## 软扫描结果",
  "",
  "本次未执行软扫描（当前环境不支持 MCP sampling）。",
  "仅硬扫描结果可用。请调用 garden-fix 处理硬错误。",
].join("\n");

export const SOFT_RENDER_SCHEMA = {
  version: DIRECTIVE_VERSION,
  kind: "soft-scan",
  sections: [
    { key: "headline", required: true, fields: ["tool", "scannedAt", "hash", "projectRoot"] },
    { key: "countsBySeverity", required: true, fields: ["error", "warning", "note", "total"] },
    { key: "findings", required: true, item: { fields: ["severity", "location", "message", "suggestion"] } },
    { key: "decisions", required: true, description: "Next step: garden-fix or garden-polish." },
  ],
  forbiddenTerms: FORBIDDEN_TERMS,
  userRenderTemplate: USER_RENDER_TEMPLATE,
  noSoftReviewTemplate: NO_SOFT_REVIEW_TEMPLATE,
};

export const HARD_RENDER_SCHEMA = {
  version: DIRECTIVE_VERSION,
  kind: "hard-scan",
  sections: [
    { key: "header", required: true, fields: ["tool", "scannedAt", "hash", "projectRoot"] },
    { key: "counts", required: true, fields: ["hardErrors", "warnings", "styleIssues", "coverageUndocumented", "missingCoreRoles"] },
    { key: "hardErrors", required: true, item: { fields: ["rule", "file", "message"] } },
    { key: "warnings", required: true, item: { fields: ["rule", "file", "message"] } },
    { key: "decisions", required: true, description: "Explicit list of user decisions needed based on hard errors and warnings." },
  ],
};

export const COMBINED_RENDER_SCHEMA = {
  version: DIRECTIVE_VERSION,
  kind: "combined-scan",
  sections: [
    { key: "hard", required: true, ref: "HARD_RENDER_SCHEMA" },
    { key: "soft", required: true, ref: "SOFT_RENDER_SCHEMA" },
    { key: "next", required: true, description: "Explicit next tool call based on both layers." },
  ],
  forbiddenTerms: FORBIDDEN_TERMS,
  userRenderTemplate: USER_RENDER_TEMPLATE,
};

export function buildAgentDirective(kind) {
  const schema = kind === "hard" ? HARD_RENDER_SCHEMA
    : kind === "soft" ? SOFT_RENDER_SCHEMA
    : kind === "combined" ? COMBINED_RENDER_SCHEMA
    : null;
  if (!schema) {
    throw new Error(`Unknown directive kind: ${kind}`);
  }
  return {
    version: DIRECTIVE_VERSION,
    kind,
    renderRequired: true,
    processingContract: PROCESSING_CONTRACT,
    renderSchema: schema,
    forbiddenTerms: FORBIDDEN_TERMS,
    userRenderTemplate: schema.userRenderTemplate || USER_RENDER_TEMPLATE,
    acknowledge: {
      via: "call garden-fix / garden-polish only after rendering; pass forceRenderAck=true only for programmatic automation that has bypassed rendering",
      cliBypass: "docs-gardener fix --force-render-ack (for automation only)",
    },
  };
}
