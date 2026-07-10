import { scanHard } from "./scan-hard.js";
import { scanSoft } from "./scan-soft.js";
import { successEnvelope } from "./envelope.js";
import { buildAgentDirective } from "./agent-directive.js";
import { projectKey } from "./state.js";

export async function scanAll(projectRoot, config, args = {}, sampler = null) {
  const hardEnvelope = scanHard(projectRoot, config);
  const softEnvelope = await scanSoft(projectRoot, config, args, sampler);
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
      body: `Hard: ${hardEnvelope.summary.hardErrors} error(s), ${hardEnvelope.summary.warnings} warning(s), ${hardEnvelope.summary.styleIssues} style issue(s). Soft: ${softEnvelope.summary.findings} finding(s).`,
    },
    hint: "Render both hard and soft envelopes per their agentDirectives, then call garden-fix to apply fixes.",
    requires_user: true,
    stop_here: true,
    allowedTools: ["garden-fix", "garden-scan-hard", "garden-scan-soft", "garden-scan"],
  });
}
