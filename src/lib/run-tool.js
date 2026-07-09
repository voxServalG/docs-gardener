import fs from "fs";
import { load } from "./config.js";
import { scanHard } from "./scan-hard.js";
import { scanSoft } from "./scan-soft.js";
import { fixHard } from "./fix-hard.js";
import { fixSoft } from "./fix-soft.js";
import { polish } from "./polish.js";
import { grow } from "./grow.js";
import { errorEnvelope } from "./envelope.js";

const TOOL_ALIASES = {
  "scan-hard": "garden-scan-hard",
  "scan-soft": "garden-scan-soft",
  "fix-hard": "garden-fix-hard",
  "fix-soft": "garden-fix-soft",
  polish: "garden-polish",
  grow: "garden-grow",
};

export function runTool(name, args = {}, projectRoot = process.cwd()) {
  const tool = TOOL_ALIASES[name] || name;
  const config = load(projectRoot);

  if (tool === "garden-scan-hard") {
    return scanHard(projectRoot, config);
  }
  if (tool === "garden-scan-soft") {
    return scanSoft(projectRoot, config, args);
  }
  if (tool === "garden-fix-hard") {
    return fixHard(projectRoot, config, args);
  }
  if (tool === "garden-fix-soft") {
    return fixSoft(projectRoot, config, args);
  }
  if (tool === "garden-polish") {
    return polish(projectRoot, config, args);
  }
  if (tool === "garden-grow") {
    return grow(projectRoot, config);
  }

  return errorEnvelope({
    tool,
    mode: "hard",
    phase: "dispatch",
    message: `Unknown tool: ${name}`,
    hint: "Use garden-scan-hard, garden-scan-soft, garden-fix-hard, garden-fix-soft, garden-polish, or garden-grow.",
  });
}

export function readJsonInput(file) {
  if (!file) return {};
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}
