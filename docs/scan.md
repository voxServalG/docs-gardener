# garden-scan

`garden-scan` 是组合入口。它先跑 `garden-scan-hard`，再跑 `garden-scan-soft`（含内部 sampling 判读），返回一个组合 envelope。

## 行为

- 依次执行 hard 与 soft 两层，两层的完整 envelope 都放在 `data.hard` 与 `data.soft` 里。
- soft 层在工具内部通过 MCP sampling 完成语义判读，返回的是已校验的问题清单，不是中间态 bundle。
- 写状态缓存 `~/.docs-gardener/state.json`（若不可写，回退内存并附 warning）。
- 缓存位置可通过 `DOCS_GARDENER_STATE_DIR` 环境变量覆盖。
- 组合 envelope 携带 `data.agentDirective`：这是 **硬环节**，调用方 agent 必须以硬代码按 `renderSchema` 处理，用自然语言向用户汇报。
- 未按 `agentDirective` 渲染前，`garden-fix` / `garden-polish` 会拒绝执行。

## Envelope

- `tool` = `garden-scan`
- `mode` = `combined`
- `phase` = `scan`
- `next` = `garden-fix`
- `data.hard` / `data.soft`：完整子 envelope。soft 子 envelope 的 `data.findings` 已是判读结果。
- `data.agentDirective`：`{ renderRequired, processingContract, renderSchema, forbiddenTerms, userRenderTemplate }`。

## Scan 可重入

`scan` / `scan-hard` / `scan-soft` 都可以随时重跑。缓存里始终保存最新一份。

## 未指定层时的行为

用户请求 "scan" 而不指明 hard 或 soft 时，`garden-scan` 会同时跑两层。若只需要单层，直接调用 `garden-scan-hard` 或 `garden-scan-soft`。
