export const DIRECTIVE_VERSION = 1;

export const PROCESSING_CONTRACT = [
  "This envelope must be consumed by hard code, not free-form paraphrase.",
  "Read data.rendered fields verbatim: counts, categories, hashes, timestamps, and diffs.",
  "Do not omit any category, do not compress numbers, do not editorialize.",
  "Present the rendered report to the user before proceeding to fix or polish.",
  "After presenting, call the acknowledge action to mark the scan as rendered; fix and polish refuse to run against an un-rendered scan.",
];

export const HARD_RENDER_SCHEMA = {
  version: DIRECTIVE_VERSION,
  kind: "hard-scan",
  sections: [
    { key: "header", required: true, fields: ["tool", "scannedAt", "hash", "projectRoot"] },
    { key: "counts", required: true, fields: ["hardErrors", "warnings", "styleIssues", "coverageUndocumented", "missingCoreRoles"] },
    { key: "hardErrors", required: true, item: { fields: ["rule", "file", "message"] } },
    { key: "warnings", required: true, item: { fields: ["rule", "file", "message"] } },
    { key: "styleIssues", required: true, item: { fields: ["rule", "file", "term", "message"] } },
    { key: "coverage.undocumented", required: true, item: { fields: ["name", "type", "reason"] } },
    { key: "architecture.missingCoreRoles", required: true, item: { fields: ["role", "path", "purpose"] } },
    { key: "diff", required: true, fields: ["previousHash", "changed", "resolved", "introduced"] },
    { key: "decisions", required: true, description: "Explicit list of user decisions needed based on hard errors and warnings." },
  ],
};

export const SOFT_RENDER_SCHEMA = {
  version: DIRECTIVE_VERSION,
  kind: "soft-scan",
  sections: [
    { key: "header", required: true, fields: ["tool", "scannedAt", "hash", "hardSummaryRef", "projectRoot"] },
    { key: "counts", required: true, fields: ["bundles", "categoryBreakdown", "confidenceFloor"] },
    { key: "bundles", required: true, item: { fields: ["id", "category", "allowedRules", "notes"] } },
    { key: "findingsStatus", required: true, fields: ["submitted", "expected", "missingBundles"] },
    { key: "diff", required: true, fields: ["previousHash", "addedBundles", "removedBundles"] },
    { key: "decisions", required: true, description: "Explicit list of pending user or LLM decisions." },
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
    acknowledge: {
      via: "call garden-fix / garden-polish only after rendering; pass forceRenderAck=true only for programmatic automation that has bypassed rendering",
      cliBypass: "docs-gardener fix --force-render-ack (for automation only)",
    },
  };
}
