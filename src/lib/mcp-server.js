import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runTool } from "./run-tool.js";
import { createSampler } from "./sampling.js";

export async function startServer() {
  const projectRoot = process.cwd();

  const server = new McpServer({
    name: "docs-gardener",
    version: "1.0.0",
  });

  const sampler = createSampler(server);

  server.tool(
    "garden-scan",
    "组合扫描：依次运行 garden-scan-hard 与 garden-scan-soft（含内部 sampling 判读），返回组合 envelope。envelope 携带 agentDirective 硬性要求 agent 用硬代码按 renderSchema 处理并汇报给用户。",
    {
      categories: z.array(z.string()).optional().describe("只生成指定分类的 soft bundle；默认三类全出"),
      confidenceFloor: z.number().min(0).max(1).optional().describe("低于该置信度的 finding 应降级为 warning/note"),
    },
    async (args) => textResult(await runTool("scan", args, projectRoot, sampler))
  );

  server.tool(
    "garden-scan-hard",
    "只做机械扫描：代码可判定的硬错误、warnings、style 词表、coverage、architecture。envelope 携带 agentDirective 硬性渲染要求。工具不修改文件。",
    {},
    async () => textResult(runTool("scan-hard", {}, projectRoot, sampler))
  );

  server.tool(
    "garden-scan-soft",
    "在 MCP 内部对文档-代码一致性、文档层级结构、文档声明进行语义判读（通过 sampling），直接返回已校验的问题清单。envelope 不暴露 bundle/rubric 中间产物。",
    {
      categories: z.array(z.string()).optional(),
      confidenceFloor: z.number().min(0).max(1).optional(),
    },
    async (args) => textResult(await runTool("scan-soft", args, projectRoot, sampler))
  );

  server.tool(
    "garden-fix",
    "消费缓存中最新的 hard 与 soft scan（含已判读的 findings）：生成 hardPlan+softPlan。若最新 scan 尚未按 agentDirective 渲染则拒绝。approved=true 时执行 replace_text。",
    {
      approved: z.boolean().optional().describe("用户批准后才可设为 true"),
      forceRenderAck: z.boolean().optional().describe("仅供自动化：跳过 agentDirective 渲染检查"),
    },
    async (args) => textResult(runTool("fix", args, projectRoot, sampler))
  );

  server.tool(
    "garden-polish",
    "准备单个 Markdown 的浅白润色上下文。若最新 scan 未渲染则拒绝，除非传 forceRenderAck。",
    {
      file: z.string().describe("要润色的 Markdown 路径"),
      forceRenderAck: z.boolean().optional().describe("仅供自动化：跳过 agentDirective 渲染检查"),
    },
    async (args) => textResult(runTool("polish", args, projectRoot, sampler))
  );

  server.tool(
    "garden-grow",
    "当 docsDir 不存在或不含 Markdown 文件时，返回文档系统 bootstrap 建议包。工具不写文件。",
    {},
    async () => textResult(runTool("grow", {}, projectRoot, sampler))
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function textResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
