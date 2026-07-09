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
    "garden-scan-hard",
    "机械扫描：代码可判定的硬错误（超行、悬挂链接、代码引用缺失、未被引用、词表命中的风格问题）。工具不修改文件。",
    {},
    async () => textResult(runTool("scan-hard", {}, projectRoot))
  );

  server.tool(
    "garden-scan-soft",
    "打包 LLM review bundle：code-doc-consistency / progressive-disclosure / prose-claims。工具不调用 LLM，也不修改文件。调用方需把 envelope 交给 LLM 生成 findings，再调用 garden-fix-soft。",
    {
      categories: z.array(z.string()).optional().describe("只生成指定分类的 bundle；默认三类全出"),
      confidenceFloor: z.number().min(0).max(1).optional().describe("低于该置信度的 finding 将降级为 warning/note"),
      report: z.any().optional().describe("garden-scan-hard 返回的 data；省略则重新执行硬扫描"),
    },
    async (args) => textResult(runTool("scan-soft", args, projectRoot))
  );

  server.tool(
    "garden-fix-hard",
    "只处理 garden-scan-hard 的 hard errors。默认返回修复计划并要求批准；approved=true 时执行 replace_text。",
    {
      report: z.any().optional().describe("garden-scan-hard 返回的 data；省略则重新扫描"),
      approved: z.boolean().optional().describe("用户批准后才可设为 true"),
    },
    async (args) => textResult(runTool("fix-hard", args, projectRoot))
  );

  server.tool(
    "garden-fix-soft",
    "消化 LLM 回填的 findings：按 findingSchema 校验、生成需批准的编辑计划、approved=true 时执行 replace_text。",
    {
      hardSummaryRef: z.string().optional().describe("garden-scan-soft 返回的 hard summary hash，确保 findings 与当前硬扫描一致"),
      reports: z.array(z.any()).describe("LLM 回填的每个 bundle 的 findings 数组"),
      approved: z.boolean().optional().describe("用户批准后才可设为 true"),
    },
    async (args) => textResult(runTool("fix-soft", args, projectRoot))
  );

  server.tool(
    "garden-polish",
    "准备单个 Markdown 的浅白润色上下文；不修改文件，不修硬错误。",
    {
      file: z.string().describe("要润色的 Markdown 路径，如 docs/README.md"),
    },
    async (args) => textResult(runTool("polish", args, projectRoot))
  );

  server.tool(
    "garden-grow",
    "为 docsDir 不存在或不含 Markdown 文件的项目返回文档系统 bootstrap 建议包。工具不写文件。",
    {},
    async () => textResult(runTool("grow", {}, projectRoot))
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function textResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
