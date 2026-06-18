import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runTool } from "./run-tool.js";

export async function startServer() {
  const projectRoot = process.cwd();

  const server = new McpServer({
    name: "docs-gardener",
    version: "1.0.0",
  });

  server.tool(
    "garden-scan",
    "扫描文档系统并返回统一 JSON envelope。结果分为 hardErrors、warnings、styleIssues、coverage 和 architecture。工具不修改文件。",
    {},
    async () => textResult(runTool("garden-scan", {}, projectRoot))
  );

  server.tool(
    "garden-fix",
    "只处理 garden-scan 产出的 hard errors。默认返回具体修复计划并要求用户批准；未批准时不会修改文件。",
    {
      report: z.any().optional().describe("garden-scan 返回的 data 对象，可省略以重新扫描当前项目"),
      approved: z.boolean().optional().describe("用户明确批准修复计划后才可设为 true"),
    },
    async (args) => textResult(runTool("garden-fix", args, projectRoot))
  );

  server.tool(
    "garden-polish",
    "准备文档润色上下文。只处理软写作和风格问题，不修改文件，不修复硬错误。",
    {
      file: z.string().describe("要润色的 Markdown 文档路径，如 docs/README.md"),
    },
    async (args) => textResult(runTool("garden-polish", args, projectRoot))
  );

  server.tool(
    "garden-grow",
    "为 docsDir 不存在或不含 Markdown 文件的项目返回文档系统 bootstrap 建议包。工具不写文件。",
    {},
    async () => textResult(runTool("garden-grow", {}, projectRoot))
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function textResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
