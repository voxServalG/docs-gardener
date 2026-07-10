import { scanHard } from "./scan-hard.js";
import { buildBundles, SOFT_CATEGORIES } from "./soft-bundles.js";
import { successEnvelope } from "./envelope.js";
import { buildAgentDirective } from "./agent-directive.js";
import { hashPayload, markScan, projectKey, getProject } from "./state.js";
import { judgeAllBundles } from "./sampling.js";

export async function scanSoft(projectRoot, config, args = {}, sampler = null) {
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

  const hash = hashPayload({
    hardSummaryRef,
    confidenceFloor,
    categories: [...new Set(bundles.map((b) => b.category))],
    bundleIds: bundles.map((b) => b.id),
  });

  const samplingResult = await judgeAllBundles(sampler, bundles, projectRoot, confidenceFloor);

  const findings = samplingResult.accepted.map((f) => ({
    severity: f.severity,
    rule: f.rule,
    confidence: f.confidence,
    location: f.evidence.docCitation,
    message: f.suggestion.text,
    evidence: f.evidence,
    suggestion: f.suggestion,
    bundle: f.bundle,
  }));

  const countsBySeverity = {
    error: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    note: findings.filter((f) => f.severity === "note").length,
    total: findings.length,
  };

  const agentDirective = buildAgentDirective("soft");
  const projectRootAbs = projectKey(projectRoot);

  const warnings = [];
  if (samplingResult.warning) {
    warnings.push("sampling-unavailable: current environment does not support MCP sampling; soft review was skipped");
  }

  const envelope = successEnvelope({
    tool: "garden-scan-soft",
    mode: "soft",
    phase: "scan-soft",
    next: "garden-fix",
    summary: {
      findings: countsBySeverity.total,
      countsBySeverity,
      confidenceFloor,
      hardSummaryRef,
      hash,
      sampling: {
        totalBundles: samplingResult.totalBundles,
        succeeded: samplingResult.succeeded,
        failed: samplingResult.failed,
        durationMs: samplingResult.durationMs,
      },
    },
    data: {
      findings,
      countsBySeverity,
      confidenceFloor,
      hardSummaryRef,
      hash,
      projectRoot: projectRootAbs,
      agentDirective,
      rejected: samplingResult.rejected,
      rejectedCount: samplingResult.rejected.length,
      sampling: {
        totalBundles: samplingResult.totalBundles,
        succeeded: samplingResult.succeeded,
        failed: samplingResult.failed,
        durationMs: samplingResult.durationMs,
        available: !samplingResult.warning,
      },
    },
    display: {
      title: countsBySeverity.total > 0 ? "Soft scan complete" : "Soft scan complete, no issues found",
      body: formatDisplayBody(countsBySeverity, samplingResult, warnings),
    },
    hint: countsBySeverity.total > 0
      ? "Render findings per agentDirective, then call garden-fix to apply fixes or garden-polish for prose."
      : "No soft issues found. Continue with garden-fix for hard errors or garden-polish for prose.",
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-fix", "garden-polish", "garden-scan-soft", "garden-scan"],
  });

  if (warnings.length > 0) {
    envelope.warnings = warnings;
  }

  const cacheOutcome = markScan(projectRoot, "soft", envelope, hash, {
    findings,
    rejected: samplingResult.rejected,
    summary: { countsBySeverity, sampling: envelope.summary.sampling },
  });
  if (cacheOutcome.warning) {
    envelope.warnings = envelope.warnings || [];
    envelope.warnings.push(cacheOutcome.warning);
  }

  return envelope;
}

function formatDisplayBody(counts, samplingResult, warnings) {
  if (warnings.includes("sampling-unavailable")) {
    return "Soft review skipped: MCP sampling not available. Only hard scan results are usable.";
  }
  const parts = [];
  parts.push(`Found ${counts.total} issue(s): ${counts.error} error(s), ${counts.warning} warning(s), ${counts.note} note(s).`);
  parts.push(`Sampling: ${samplingResult.succeeded}/${samplingResult.totalBundles} bundle(s) judged in ${samplingResult.durationMs}ms.`);
  return parts.join(" ");
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
