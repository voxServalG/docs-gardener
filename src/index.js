#!/usr/bin/env node

import { readJsonInput, runTool } from "./lib/run-tool.js";

const command = process.argv[2];
const projectRoot = process.cwd();

async function main() {
  switch (command) {
    case "deploy":
    case "init": {
      const { run } = await import("./deploy/ui.js");
      await run(projectRoot);
      break;
    }
    case "mcp": {
      const { startServer } = await import("./lib/mcp-server.js");
      await startServer();
      break;
    }
    case "scan":
    case "grow": {
      printJson(runTool(command, {}, projectRoot));
      break;
    }
    case "polish": {
      printJson(runTool(command, parseFileArg(process.argv.slice(3)), projectRoot));
      break;
    }
    case "fix": {
      const args = parseFixArgs(process.argv.slice(3));
      printJson(runTool(command, args, projectRoot));
      break;
    }
    default: {
      console.log("docs-gardener · MCP 文档治理工具\n");
      console.log("用法:");
      console.log("  docs-gardener deploy                 部署配置（交互式）");
      console.log("  docs-gardener mcp                    启动 MCP server");
      console.log("  docs-gardener scan                   扫描文档系统");
      console.log("  docs-gardener fix --input scan.json  从 scan 报告准备硬错误修复计划");
      console.log("  docs-gardener polish --file docs/x.md 准备文档润色上下文");
      console.log("  docs-gardener grow                   为没有 Markdown 的 docsDir 返回 bootstrap 建议包");
      break;
    }
  }
}

function parseFileArg(argv) {
  const fileIndex = argv.indexOf("--file");
  return {
    file: fileIndex >= 0 ? argv[fileIndex + 1] : undefined,
  };
}

function parseFixArgs(argv) {
  const inputIndex = argv.indexOf("--input");
  const approved = argv.includes("--approved") || argv.includes("--yes");
  const input = inputIndex >= 0 ? readJsonInput(argv[inputIndex + 1]) : {};
  return {
    ...input,
    approved,
  };
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
