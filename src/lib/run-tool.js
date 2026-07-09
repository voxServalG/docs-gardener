import fs from "fs";
import { load } from "./config.js";
import { scanAll } from "./scan.js";
import { scanHard } from "./scan-hard.js";
import { scanSoft } from "./scan-soft.js";
import { fix } from "./fix.js";
import { polish } from "./polish.js";
import { grow } from "./grow.js";
import { markRendered } from "./state.js";
import { successEnvelope, errorEnvelope } from "./envelope.js";

const TOOL_ALIASES = {
  scan: "garden-scan",
  "scan-hard": "garden-scan-hard",
  "scan-soft": "garden-scan-soft",
  fix: "garden-fix",
  polish: "garden-polish",
  grow: "garden-grow",
  ack: "garden-ack",
};

export function runTool(name, args = {}, projectRoot = process.cwd()) {
  const tool = TOOL_ALIASES[name] || name;
  const config = load(projectRoot);

  if (tool === "garden-scan") {
    return scanAll(projectRoot, config, args);
  }
  if (tool === "garden-scan-hard") {
    return scanHard(projectRoot, config);
  }
  if (tool === "garden-scan-soft") {
    return scanSoft(projectRoot, config, args);
  }
  if (tool === "garden-fix") {
    return fix(projectRoot, config, args);
  }
  if (tool === "garden-polish") {
    return polish(projectRoot, config, args);
  }
  if (tool === "garden-grow") {
    return grow(projectRoot, config);
  }
  if (tool === "garden-ack") {
    return ack(projectRoot, args);
  }

  return errorEnvelope({
    tool,
    mode: "hard",
    phase: "dispatch",
    message: `Unknown tool: ${name}`,
    hint: "Use garden-scan, garden-scan-hard, garden-scan-soft, garden-fix, garden-polish, or garden-grow.",
  });
}

function ack(projectRoot, args) {
  const kinds = args && Array.isArray(args.kinds) ? args.kinds : ["hard", "soft"];
  const results = {};
  for (const kind of kinds) {
    results[kind] = markRendered(projectRoot, kind);
  }
  return successEnvelope({
    tool: "garden-ack",
    mode: "bridge",
    phase: "ack",
    next: "garden-fix",
    summary: { acknowledged: Object.keys(results) },
    data: { results },
    display: {
      title: "Scan render acknowledged",
      body: "Marked the requested scan kinds as rendered so garden-fix / garden-polish can proceed.",
    },
    hint: "Only use garden-ack for programmatic automation that has bypassed rendering. Regular usage should render envelopes and skip this.",
    allowedTools: ["garden-fix", "garden-polish"],
  });
}

export function readJsonInput(file) {
  if (!file) return {};
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}
