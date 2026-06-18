import fs from "fs";
import { load } from "./config.js";
import { scan } from "./scanner.js";
import { fix } from "./fixer.js";
import { polish } from "./polish.js";
import { grow } from "./grow.js";
import { errorEnvelope } from "./envelope.js";

const TOOL_ALIASES = {
  scan: "garden-scan",
  fix: "garden-fix",
  polish: "garden-polish",
  grow: "garden-grow",
};

export function runTool(name, args = {}, projectRoot = process.cwd()) {
  const tool = TOOL_ALIASES[name] || name;
  const config = load(projectRoot);

  if (tool === "garden-scan") {
    return scan(projectRoot, config);
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

  return errorEnvelope({
    tool,
    mode: "hard",
    phase: "dispatch",
    message: `Unknown tool: ${name}`,
    hint: "Use garden-scan, garden-fix, garden-polish, or garden-grow.",
  });
}

export function readJsonInput(file) {
  if (!file) return {};
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}
