# docs-gardener

MCP 文档语义审查工具。配合 LLM 对比文档描述与代码实际行为是否一致。

## 安装

```bash
npm install -g github:voxServalG/docs-gardener
```

需要 Node.js >= 18。依赖 `@modelcontextprotocol/sdk` 和 `zod`。

## 快速开始

```bash
docs-gardener deploy     # 自动探测项目配置并部署
docs-gardener mcp        # 启动 MCP server
```

### deploy

交互式配置向导。自动探测项目的文档目录、代码目录、代码后缀、当前 git 分支，以及代码中的**模块名录**（从 Python 代码中提取 CLI 命令、信号/策略/策略 catalog）。

完成后写入 `docs-gardener.json`，并打印 opencode.json 的 MCP 配置建议（需手动添加）。

### mcp

启动 MCP server，通过 stdio 与 opencode 通信。暴露 3 个 tool：

| Tool | 作用 |
|------|------|
| `garden-scan` | 全量扫描 docs 目录，返回所有文件的元数据、catalogs 名单和机械预检问题 |
| `garden-check` | 深度检查单个 doc 文件，返回 doc 全文 + 关联代码全文 + catalogs |
| `garden-apply` | 批量编辑文档并创建 GitHub PR，失败自动回滚 |

## 模块名录

`docs-gardener.json` 中的 `catalogs` 配置项用于定义模块名录。每个条目包含：

| 字段 | 说明 |
|------|------|
| `enabled` | 是否启用 |
| `source` | 源代码文件路径 |
| `strategy` | 提取策略：`dict`（从函数提取字典键）或 `argparse`（解析命令子命令） |
| `funcName` | `dict` 策略的函数名 |
| `prefix` | `argparse` 策略的命令前缀 |
| `codeDir` | 模块文件存放目录（用于 checker 找关联代码） |

示例：

```json
{
  "catalogs": {
    "signals": {
      "enabled": true,
      "source": "src/signals/top.py",
      "strategy": "dict",
      "funcName": "build_signal_catalog",
      "codeDir": "src/signals"
    },
    "cli": {
      "enabled": true,
      "source": "src/cli/parse.py",
      "strategy": "argparse",
      "prefix": "mycli",
      "codeDir": "src/cli"
    }
  }
}
```

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
