# garden-fix

`garden-fix` 是唯一的修复入口。它消费 `~/.docs-gardener/state.json` 中最新的 hard 与 soft scan 结果，生成需批准的编辑计划。

## 输入

- `findings`：可选。LLM 回填的 findings 报告数组，形如 `[{ bundleId, findings: [...] }]`。若缓存里已有等价 findings，可省略。
- `approved`：`true` 时执行 `replace_text` 类项；否则只返回计划。
- `forceRenderAck`：`true` 时跳过 agentDirective 渲染检查（**仅供自动化**；日常调用应先按 directive 渲染再调 fix）。

## 前置检查

1. 缓存里必须至少有一份 scan（hard 或 soft）。
2. 最新的 hard / soft scan 都必须已经按 agentDirective 渲染。未渲染时拒绝并回引导到 render 或使用 `forceRenderAck`。
3. 若最新 soft scan 存在但 findings 缓存不匹配当前 soft hash，拒绝并要求补 findings。

## 计划构成

- `hardPlan`：从最新 hard scan 的 `hardErrors` 派生的 `manual` 修复项（`dead-link` / `dead-reference` / `missing-docs-dir` / `has-reference` 等）。
- `softPlan`：从有效 findings 派生的 `manual` 或 `replace_text` 项。
- `rejected`：finding schema 校验未通过的项，带 `reason`。

## Envelope

- `tool` = `garden-fix`
- `mode` = `combined`
- `phase` = `fix-plan` / `apply`
- `next`：
  - 待批准：`garden-fix`
  - 应用完成：`garden-polish`
- `data.hardPlan` / `data.softPlan` / `data.rejected`：分离后的状态。
- 未批准时 `requires_user = true`、`stop_here = true`。

## 位阶

前置：至少完成一次 `garden-scan`（或 `scan-hard` + `scan-soft`），且 agent 已按 agentDirective 渲染。soft findings 必须补全（LLM 回填 → 通过 `findings` 参数提交给 `garden-fix`）。

后置：`garden-polish` 处理单文档浅白润色。
