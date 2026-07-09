import crypto from "crypto";
import { scanHard } from "./scan-hard.js";
import { buildBundles, SOFT_CATEGORIES } from "./soft-bundles.js";
import { successEnvelope } from "./envelope.js";

export function scanSoft(projectRoot, config, args = {}) {
  const hardReport = args.report || scanHard(projectRoot, config).data;
  const categories = normalizeCategories(args.categories);
  const confidenceFloor = clampConfidence(args.confidenceFloor);

  const { bundles, findingSchema, constraints } = buildBundles(
    projectRoot,
    config,
    hardReport,
    { categories, confidenceFloor }
  );

  const hardSummaryRef = hashReport(hardReport);

  const categoriesPresent = [...new Set(bundles.map((b) => b.category))];

  return successEnvelope({
    tool: "garden-scan-soft",
    mode: "soft",
    phase: "scan-soft",
    next: "garden-fix-soft",
    summary: {
      bundles: bundles.length,
      categories: categoriesPresent,
      confidenceFloor,
      hardSummaryRef,
    },
    data: {
      hardSummaryRef,
      confidenceFloor,
      categories: categoriesPresent,
      bundles,
      findingSchema,
      constraints,
    },
    display: {
      title: "Soft review bundles ready",
      body: `Prepared ${bundles.length} review bundle(s) across ${categoriesPresent.length} categor(y|ies). LLM must judge bundles and submit findings back through garden-fix-soft.`,
    },
    hint: "Give this envelope to a LLM. The LLM must fill findings per bundle, then call garden-fix-soft with { hardSummaryRef, reports }.",
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-fix-soft"],
  });
}

function normalizeCategories(value) {
  if (!Array.isArray(value) || value.length === 0) return SOFT_CATEGORIES;
  return value.filter((cat) => SOFT_CATEGORIES.includes(cat));
}

function clampConfidence(value) {
  if (typeof value !== "number") return 0.6;
  if (Number.isNaN(value)) return 0.6;
  return Math.min(1, Math.max(0, value));
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
