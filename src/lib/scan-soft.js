import { scanHard } from "./scan-hard.js";
import { buildBundles, SOFT_CATEGORIES } from "./soft-bundles.js";
import { successEnvelope } from "./envelope.js";
import { buildAgentDirective } from "./agent-directive.js";
import { hashPayload, markScan, projectKey, getProject } from "./state.js";

export function scanSoft(projectRoot, config, args = {}) {
  const cached = getProject(projectRoot);
  const hardEnvelope = cached.hard ? cached.hard.envelope : scanHard(projectRoot, config);
  const hardReport = hardEnvelope.data;

  const categories = normalizeCategories(args.categories);
  const confidenceFloor = clampConfidence(args.confidenceFloor);

  const { bundles, findingSchema, constraints } = buildBundles(
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

  const previous = cached.soft;
  const diff = diffSoftScans(previous ? previous.envelope.data : null, bundles);
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
      findingSchema,
      constraints,
      hash,
      previousHash: previous ? previous.hash : null,
      diff,
      projectRoot: projectRootAbs,
      agentDirective,
    },
    display: {
      title: "Soft review bundles ready",
      body: `Prepared ${bundles.length} review bundle(s) across ${categoriesPresent.length} categor(y|ies). Hash ${hash}.`,
    },
    hint: "Render this envelope per agentDirective. Then hand bundles to LLM. Submit findings back through garden-fix with { findings } before requesting approval.",
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-fix", "garden-scan-soft", "garden-scan"],
  });

  const cacheOutcome = markScan(projectRoot, "soft", envelope, hash);
  if (cacheOutcome.warning) {
    envelope.warnings = envelope.warnings || [];
    envelope.warnings.push(cacheOutcome.warning);
  }

  return envelope;
}

function diffSoftScans(previous, currentBundles) {
  if (!previous) {
    return { previousHash: null, addedBundles: [], removedBundles: [] };
  }
  const prevIds = new Set((previous.bundles || []).map((b) => b.id));
  const currIds = new Set(currentBundles.map((b) => b.id));
  const addedBundles = [...currIds].filter((id) => !prevIds.has(id));
  const removedBundles = [...prevIds].filter((id) => !currIds.has(id));
  return { previousHash: previous.hash || null, addedBundles, removedBundles };
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
