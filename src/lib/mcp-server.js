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
    "组合扫描：依次运行 garden-scan-hard 与 garden-scan-soft，返回组合 envelope。envelope 携带 agentDirective 硬性要求 agent 用硬代码按 renderSchema 处理并汇报给用户。",
    {
      categories: z.array(z.string()).optional().describe("只生成指定分类的 soft bundle；默认三类全出"),
      confidenceFloor: z.number().min(0).max(1).optional().describe("低于该置信度的 finding 应降级为 warning/note"),
    },
    async (args) => textResult(runTool("scan", args, projectRoot))
  );

  server.tool(
    "garden-scan-hard",
    "只做机械扫描：代码可判定的硬错误、warnings、style 词表、coverage、architecture。envelope 携带 agentDirective 硬性渲染要求。工具不修改文件。",
    {},
    async () => textResult(runTool("scan-hard", {}, projectRoot))
  );

  server.tool(
    "garden-scan-soft",
    "只打包 LLM review bundle：code-doc-consistency / progressive-disclosure / prose-claims。envelope 携带 agentDirective 硬性渲染要求。工具不调用 LLM，也不修改文件。",
    {
      categories: z.array(z.string()).optional(),
      confidenceFloor: z.number().min(0).max(1).optional(),
    },
    async (args) => textResult(runTool("scan-soft", args, projectRoot))
  );

  server.tool(
    "garden-fix",
    "消费缓存中最新的 hard 与 soft scan：生成 hardPlan+softPlan；若最新 scan 尚未按 agentDirective 渲染或 soft findings 未补全则拒绝。approved=true 时执行 replace_text。",
    {
      findings: z.array(z.any()).optional().describe("LLM 回填的 findings，形如 [{ bundleId, findings: [...] }]；缓存已有等价 findings 时可省略"),
      approved: z.boolean().optional().describe("用户批准后才可设为 true"),
      forceRenderAck: z.boolean().optional().describe("仅供自动化：跳过 agentDirective 渲染检查"),
    },
    async (args) => textResult(runTool("fix", args, projectRoot))
  );

  server.tool(
    "garden-polish",
    "准备单个 Markdown 的浅白润色上下文。若最新 scan 未渲染则拒绝，除非传 forceRenderAck。",
    {
      file: z.string().describe("要润色的 Markdown 路径"),
      forceRenderAck: z.boolean().optional().describe("仅供自动化：跳过 agentDirective 渲染检查"),
    },
    async (args) => textResult(runTool("polish", args, projectRoot))
  );

  server.tool(
    "garden-grow",
    "当 docsDir 不存在或不含 Markdown 文件时，返回文档系统 bootstrap 建议包。工具不写文件。",
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
