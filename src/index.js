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
    case "scan-hard":
    case "grow": {
      printJson(runTool(command, {}, projectRoot));
      break;
    }
    case "scan":
    case "scan-soft": {
      const args = parseScanArgs(process.argv.slice(3));
      printJson(runTool(command, args, projectRoot));
      break;
    }
    case "polish": {
      printJson(runTool(command, parsePolishArgs(process.argv.slice(3)), projectRoot));
      break;
    }
    case "fix": {
      const args = parseFixArgs(process.argv.slice(3));
      printJson(runTool(command, args, projectRoot));
      break;
    }
    case "ack": {
      const args = parseAckArgs(process.argv.slice(3));
      printJson(runTool(command, args, projectRoot));
      break;
    }
    default: {
      console.log("docs-gardener · MCP 文档治理工具\n");
      console.log("用法:");
      console.log("  docs-gardener deploy                          部署配置（交互式）");
      console.log("  docs-gardener mcp                             启动 MCP server");
      console.log("  docs-gardener scan                            组合扫描 (hard + soft)");
      console.log("  docs-gardener scan-hard                       仅机械扫描");
      console.log("  docs-gardener scan-soft                       准备软扫描证据与 agent 判读契约");
      console.log("  docs-gardener fix --approved                  消费最新 scan，产生修复计划");
      console.log("  docs-gardener polish --file docs/x.md         准备单文档浅白润色上下文");
      console.log("  docs-gardener grow                            为空 docsDir 返回 bootstrap 建议包");
      console.log("  docs-gardener ack --kinds hard,soft           自动化：将最新 scan 标记为已渲染 (跳过 agentDirective)");
      break;
    }
  }
}

function parsePolishArgs(argv) {
  const fileIndex = argv.indexOf("--file");
  const force = argv.includes("--force-render-ack");
  return {
    file: fileIndex >= 0 ? argv[fileIndex + 1] : undefined,
    forceRenderAck: force || undefined,
  };
}

function parseFixArgs(argv) {
  const approved = argv.includes("--approved") || argv.includes("--yes");
  const force = argv.includes("--force-render-ack");
  return {
    ...readJsonInput(inputFile(argv)),
    approved,
    forceRenderAck: force || undefined,
  };
}

function inputFile(argv) {
  const inputIndex = argv.indexOf("--input");
  return inputIndex >= 0 ? argv[inputIndex + 1] : null;
}

function parseScanArgs(argv) {
  const categoriesIndex = argv.indexOf("--categories");
  const floorIndex = argv.indexOf("--confidence-floor");
  const args = {};
  if (categoriesIndex >= 0) {
    args.categories = argv[categoriesIndex + 1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (floorIndex >= 0) {
    args.confidenceFloor = Number(argv[floorIndex + 1]);
  }
  return args;
}

function parseAckArgs(argv) {
  const kindsIndex = argv.indexOf("--kinds");
  if (kindsIndex < 0) return {};
  return {
    kinds: argv[kindsIndex + 1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  };
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
