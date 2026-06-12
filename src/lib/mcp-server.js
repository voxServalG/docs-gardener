import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "path";
import { load } from "./config.js";
import { scan } from "./scanner.js";
import { check } from "./checker.js";
import { apply } from "./apply.js";
import { polish } from "./polish.js";

export async function startServer() {
  const projectRoot = process.cwd();
  const config = load(projectRoot);

  const server = new McpServer({
    name: "docs-gardener",
    version: "1.0.0",
  });

  server.tool(
    "garden-scan",
    "全量扫描 docs 目录，返回所有文件的元数据、catalogs（CLI/signal/strategy/policy 名单）和机械预检发现的问题。用于 LLM 第一眼筛选哪些文件需要深度检查。代码引用支持两种格式：裸路径（如 src/foo.py）和 Markdown 链接（如 [field.py](../src/foo.py)），`.py` 后缀的链接自动归入 referencesCode。推荐流程：先 garden-scan 筛选 → 对有问题的文件 garden-check → 最后 garden-apply 修复。",
    {},
    async () => {
      const result = scan(projectRoot, config);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "garden-check",
    "深度检查单个 doc 文件，返回 doc 全文 + 关联代码文件全文 + catalogs。用于 LLM 做语义对比（doc 描述 vs 代码实际行为是否一致）。从文档中自动提取代码引用（裸路径和 Markdown 链接）并加载对应代码文件全文到 relatedCode。文档中推荐使用 Markdown 链接格式引用代码：`> 代码: [field.py](../../src/field.py)`",
    {
      file: z.string().describe("doc 文件相对路径，如 docs/specs/signal.md"),
    },
    async (args) => {
      const result = check(projectRoot, config, args.file);
      if (result.error) {
        return {
          content: [{ type: "text", text: `❌ ${result.error}` }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "garden-polish",
    "按浅白写作指导生成文档润色建议。工具不会修改文件；可应用建议固定输出 file、oldText、newText、reason 四个字段，并通过 envelope 返回 display、hint、requires_user、stop_here、allowedTools、blockedTools 和 recovery，方便 agent 审阅后再调用 garden-apply。",
    {
      file: z.string().describe("要润色的 Markdown 文档路径，如 docs/README.md"),
    },
    async (args) => {
      const result = polish(projectRoot, config, args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "garden-apply",
    "批量应用文档修改并创建 Pull Request。所有修改写入一个分支，通过 gh CLI 提交 push 并开 PR。编辑失败则整批回滚。",
    {
      branch: z.string().describe("分支名，如 docs/gardening-20260527"),
      title: z.string().describe("PR 标题"),
      body: z.string().describe("PR 正文（markdown）"),
      fixes: z
        .array(
          z.object({
            file: z.string().describe("文件相对路径"),
            edits: z
              .array(
                z.object({
                  oldText: z.string().describe("要替换的原文本（必须精确匹配）"),
                  newText: z.string().describe("替换后的新文本"),
                })
              )
              .describe("编辑列表"),
          })
        )
        .describe("批量修改指令"),
    },
    async (args) => {
      const result = apply(projectRoot, config, args);
      if (result.ok) {
        return {
          content: [{ type: "text", text: `✅ PR created: ${result.url}` }],
        };
      }
      return {
        content: [{ type: "text", text: `❌ ${result.error}` }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
