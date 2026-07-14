# docs-gardener

MCP 文档治理工具。它把文档系统分成硬校验（代码可判定）与软校验（LLM 判读带证据）两层，并通过 `agentDirective` 硬性要求 agent 用硬代码消费扫描结果并向用户完整汇报。docs-gardener 作为独立的 MCP server 与 CLI 运行，平列项目可直接消费 envelope。

## 安装

```bash
npm install -g @voxstudio/docs-gardener@latest
```

国内网络需要镜像时，可显式追加 `--registry=https://registry.npmmirror.com`。更新使用同一条命令；MCP 客户端直接运行 `docs-gardener mcp`，不再通过 `npx` 或 GitHub 地址启动。

需要 Node.js >= 18。依赖 `@modelcontextprotocol/sdk` 和 `zod`。

## 快速开始

```bash
docs-gardener deploy
docs-gardener mcp

docs-gardener scan                    # 组合扫描 (hard + soft)
docs-gardener scan-hard               # 仅机械扫描
docs-gardener scan-soft               # 准备语义审查证据与判读契约
docs-gardener fix --input findings.json --approved
docs-gardener polish --file docs/README.md
docs-gardener grow
docs-gardener --version
```

Codex CLI 项目配置示例：

```toml
[mcp_servers.docs-gardener]
command = "docs-gardener"
args = ["mcp"]
startup_timeout_sec = 60
tool_timeout_sec = 300
```

### deploy

交互式配置向导，写入 `docs-gardener.json` 并打印 MCP 配置建议。

### mcp

启动 MCP server，通过 stdio 与 MCP 客户端通信。公开 6 个 tool：

| Tool | Mode | 作用 |
|------|------|------|
| `garden-scan` | `combined` | 依次运行 hard + soft，返回组合 envelope |
| `garden-scan-hard` | `hard` | 只做机械扫描 |
| `garden-scan-soft` | `soft` | 返回结构化证据与判读契约，由调用 agent 完成语义审查 |
| `garden-fix` | `combined` | 校验并缓存 agent 回填结果，产出 approval-gated 修复计划 |
| `garden-polish` | `soft` | 单文档浅白润色上下文 |
| `garden-grow` | `bridge` | 当 `docsDir` 不存在或不含 Markdown 时的 bootstrap |

## 拓扑

```text
scan (unspecified) → scan-hard + scan-soft in one call
scan-hard / scan-soft (可任意时点、任意顺序重跑)
      │
      ▼
     fix (基于最新 hard + soft 缓存)
      │
      ▼
    polish (单文档，任意时点)
```

`garden-grow` 是空 docsDir 的 bootstrap 工具，不写文件。

## Agent directive 硬环节

每个 `garden-scan-*` envelope 都带 `data.agentDirective`：`renderRequired: true` + `processingContract` + `renderSchema` + `forbiddenTerms` + `userRenderTemplate`。agent 必须按契约审查 soft 证据，用自然语言汇报问题，再把结构化结果传给 `garden-fix`。内部术语禁止出现在用户可见输出中。未渲染时，`garden-fix` 与 `garden-polish` 会拒绝并返回引导。

自动化场景可在 `garden-fix` 里传 `forceRenderAck: true` 显式跳过，但这条通道仅供编程自动化使用。

## 状态缓存

状态写到 `~/.docs-gardener/state.json`（可通过 `DOCS_GARDENER_STATE_DIR` 覆盖）。按 `projectRoot` 绝对路径分 key，跨进程持久。soft 证据在扫描时缓存，agent 回填的 accepted/rejected 结果在 `garden-fix` 时缓存。若不可写，工具自动降级为进程内存并在 envelope 里附 warning。

## JSON envelope

```json
{
  "ok": true,
  "tool": "garden-scan",
  "mode": "combined",
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
