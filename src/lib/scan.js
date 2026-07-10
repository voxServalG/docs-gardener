import { scanHard } from "./scan-hard.js";
import { scanSoft } from "./scan-soft.js";
import { successEnvelope } from "./envelope.js";
import { buildAgentDirective } from "./agent-directive.js";
import { projectKey } from "./state.js";

export function scanAll(projectRoot, config, args = {}) {
  const hardEnvelope = scanHard(projectRoot, config);
  const softEnvelope = scanSoft(projectRoot, config, args);
  const agentDirective = buildAgentDirective("combined");

  const summary = {
    hard: hardEnvelope.summary,
    soft: softEnvelope.summary,
  };

  return successEnvelope({
    tool: "garden-scan",
    mode: "combined",
    phase: "scan",
    next: "garden-fix",
    summary,
    data: {
      projectRoot: projectKey(projectRoot),
      hard: hardEnvelope,
      soft: softEnvelope,
      agentDirective,
    },
    display: {
      title: "Combined scan complete",
      body: `Hard: ${hardEnvelope.summary.hardErrors} error(s), ${hardEnvelope.summary.warnings} warning(s), ${hardEnvelope.summary.styleIssues} style issue(s). Soft: ${softEnvelope.summary.bundles} evidence group(s).`,
    },
    hint: "Render both hard and soft envelopes per their agentDirectives. For soft: judge bundles, produce findings, then call garden-fix with { findings }.",
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-fix", "garden-scan-hard", "garden-scan-soft", "garden-scan"],
  });
}
