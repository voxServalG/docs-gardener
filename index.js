#!/usr/bin/env node

import path from "path";

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
    default: {
      console.log("docs-gardener · MCP 文档语义审查工具\n");
      console.log("用法:");
      console.log("  docs-gardener deploy    部署配置（交互式）");
      console.log("  docs-gardener mcp       启动 MCP server");
      break;
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
