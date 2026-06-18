# docs-gardener

MCP 文档治理工具。它帮助 agent 扫描文档系统、区分硬错误和软润色问题，并在空文档系统中生成 bootstrap 建议包。

## 安装

```bash
npm install -g github:voxServalG/docs-gardener
```

需要 Node.js >= 18。依赖 `@modelcontextprotocol/sdk` 和 `zod`。

## 快速开始

```bash
docs-gardener deploy
docs-gardener mcp
docs-gardener scan
docs-gardener fix --input scan.json
docs-gardener polish --file docs/README.md
docs-gardener grow
```

### deploy

交互式配置向导。自动探测项目的文档目录、代码目录、代码后缀、当前 git 分支，以及代码中的模块名录。

完成后写入 `docs-gardener.json`，并打印 MCP 配置建议。

### mcp

启动 MCP server，通过 stdio 与 MCP 客户端通信。公开 4 个 tool：

| Tool | Mode | 作用 |
|------|------|------|
| `garden-scan` | `hard` | 扫描文档系统，返回 hard errors、warnings、style issues、coverage 和 architecture |
| `garden-fix` | `hard` | 只处理 `garden-scan` 产出的 hard errors；默认只返回修复计划，要求用户批准 |
| `garden-polish` | `soft` | 准备单个 Markdown 文档的润色上下文、写作指导、保护约束和 edit schema |
| `garden-grow` | `bridge` | 当 `docsDir` 不存在或不含 Markdown 文件时，返回文档系统 bootstrap 建议包 |

主流程是：

```text
garden-scan -> garden-fix -> garden-polish
```

`garden-grow` 是空文档系统的 bootstrap 工具，不会写文件。

## JSON envelope

公开 CLI 和 MCP tool 都返回同一层 JSON envelope：

```json
{
  "ok": true,
  "tool": "garden-scan",
  "mode": "hard",
  "phase": "scan",
  "next": "garden-fix",
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

`catalogs` 用于定义项目公开 surface，例如 CLI 命令、策略名录或配置项来源。`garden-scan` 会把启用的 catalog 纳入 coverage 报告。
