# docs-gardener

MCP 文档治理工具。它把文档系统的问题拆成两层：硬校验（代码可判定）与软校验（LLM 判读带证据）。docs-gardener 作为独立的 MCP server 与 CLI 运行，平列项目可直接消费 envelope。

## 安装

```bash
npm install -g github:voxServalG/docs-gardener
```

需要 Node.js >= 18。依赖 `@modelcontextprotocol/sdk` 和 `zod`。

## 快速开始

```bash
docs-gardener deploy
docs-gardener mcp
docs-gardener scan-hard
docs-gardener fix-hard --input scan.json
docs-gardener scan-soft
docs-gardener fix-soft --input findings.json
docs-gardener polish --file docs/README.md
docs-gardener grow
```

### deploy

交互式配置向导，写入 `docs-gardener.json` 并打印 MCP 配置建议。

### mcp

启动 MCP server，通过 stdio 与 MCP 客户端通信。公开 6 个 tool：

| Tool | Mode | 作用 |
|------|------|------|
| `garden-scan-hard` | `hard` | 机械扫描，返回 hard errors、warnings、style issues、coverage 和 architecture |
| `garden-fix-hard` | `hard` | 只处理 `garden-scan-hard` 的 hard errors；默认返回修复计划，要求批准 |
| `garden-scan-soft` | `soft` | 打包 code-doc-consistency / progressive-disclosure / prose-claims 三类 LLM review bundle。工具不调用 LLM |
| `garden-fix-soft` | `soft` | 校验 LLM 回填的 findings；把合法的 findings 变成需批准的编辑计划 |
| `garden-polish` | `soft` | 准备单个 Markdown 文档的浅白润色上下文与保护约束 |
| `garden-grow` | `bridge` | 当 `docsDir` 不存在或不含 Markdown 文件时，返回文档系统 bootstrap 建议包 |

内建拓扑：

```text
garden-scan-hard -> garden-fix-hard -> garden-scan-soft -> garden-fix-soft -> garden-polish
```

`garden-grow` 是空文档系统的 bootstrap 工具，不会写文件。

## JSON envelope

公开 CLI 和 MCP tool 都返回同一层 JSON envelope：

```json
{
  "ok": true,
  "tool": "garden-scan-hard",
  "mode": "hard",
  "phase": "scan-hard",
  "next": "garden-scan-soft",
  "summary": {},
  "data": {},
  "error": null
}
```

失败时 `ok` 为 `false`，`error` 包含 `type`、`subtype`、`param`、`message` 和 `hint`。

## 配置

`docs-gardener.json` 示例：

```json
{
  "docsDir": "docs",
  "codeDirs": ["src", "tests"],
  "codeExt": ".py",
  "baseBranch": "main",
  "catalogs": {}
}
```

| 字段 | 说明 | 默认 |
|------|------|------|
| `docsDir` | 文档目录 | `docs` |
| `codeDirs` | 代码目录列表 | `["src"]` |
| `codeExt` | 代码文件后缀 | `.py` |
| `baseBranch` | PR 目标分支 | `main` |
| `catalogs` | 模块名录配置 | `{}` |

## 模块名录

`catalogs` 用于声明项目公开 surface，例如 CLI 命令、策略名录或配置项来源。`garden-scan-hard` 会把启用的 catalog 纳入 coverage 报告；`garden-scan-soft` 会把 documented surface 打包成 code-doc-consistency bundle。
