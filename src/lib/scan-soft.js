import { scanHard } from "./scan-hard.js";
import { buildBundles, SOFT_CATEGORIES, FINDING_SCHEMA, CONSTRAINTS } from "./soft-bundles.js";
import { successEnvelope } from "./envelope.js";
import { buildAgentDirective } from "./agent-directive.js";
import { hashPayload, markScan, projectKey, getProject } from "./state.js";

export function scanSoft(projectRoot, config, args = {}) {
  const cached = getProject(projectRoot);
  const hardEnvelope = cached.hard ? cached.hard.envelope : scanHard(projectRoot, config);
  const hardReport = hardEnvelope.data;

  const categories = normalizeCategories(args.categories);
  const confidenceFloor = clampConfidence(args.confidenceFloor);

  const { bundles } = buildBundles(
    projectRoot,
    config,
    hardReport,
    { categories, confidenceFloor }
  );

  const hardSummaryRef = cached.hard ? cached.hard.hash : hashPayload(hardReport);
  const categoriesPresent = [...new Set(bundles.map((b) => b.category))];
  const categoryBreakdown = categoriesPresent.reduce((acc, cat) => {
    acc[cat] = bundles.filter((b) => b.category === cat).length;
    return acc;
  }, {});

  const hash = hashPayload({
    hardSummaryRef,
    confidenceFloor,
    categories: categoriesPresent,
    bundleIds: bundles.map((b) => b.id),
  });

  const agentDirective = buildAgentDirective("soft");
  const projectRootAbs = projectKey(projectRoot);

  const envelope = successEnvelope({
    tool: "garden-scan-soft",
    mode: "soft",
    phase: "scan-soft",
    next: "garden-fix",
    summary: {
      bundles: bundles.length,
      categories: categoriesPresent,
      categoryBreakdown,
      confidenceFloor,
      hardSummaryRef,
      hash,
    },
    data: {
      hardSummaryRef,
      confidenceFloor,
      categories: categoriesPresent,
      categoryBreakdown,
      bundles,
      findingSchema: FINDING_SCHEMA,
      constraints: CONSTRAINTS,
      hash,
      projectRoot: projectRootAbs,
      agentDirective,
    },
    display: {
      title: "Soft scan evidence ready",
      body: `Prepared ${bundles.length} evidence group(s) across ${categoriesPresent.length} categor(y|ies). Agent must judge each group per agentDirective and feed findings to garden-fix.`,
    },
    hint: "Read data.bundles, judge each one per data.findingSchema and data.constraints, produce findings, then call garden-fix with { findings }. Render results to user per agentDirective (natural language, no internal terms).",
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-fix", "garden-polish", "garden-scan-soft", "garden-scan"],
  });

  const cacheOutcome = markScan(projectRoot, "soft", envelope, hash);
  if (cacheOutcome.warning) {
    envelope.warnings = envelope.warnings || [];
    envelope.warnings.push(cacheOutcome.warning);
  }

  return envelope;
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
