# garden-fix

`garden-fix` 是唯一的修复入口。它消费 `~/.docs-gardener/state.json` 中最新的 hard 与 soft scan 结果，生成需批准的编辑计划。

## 输入

- `approved`：`true` 时执行 `replace_text` 类项；否则只返回计划。
- `forceRenderAck`：`true` 时跳过 agentDirective 渲染检查（**仅供自动化**；日常调用应先按 directive 渲染再调 fix）。
- `findings`：agent 审查最新 soft scan 后提交的 `{ bundleId, findings }` 数组。首次调用必须提供，显式空数组表示已审查且没有问题。

## 前置检查

1. 缓存里必须至少有一份 scan（hard 或 soft）。
2. agent 必须先按 `agentDirective` 向用户展示结果。携带 `findings` 的调用确认该步骤已完成；不携带时，未渲染的 scan 会被拒绝。

## 计划构成

- `hardPlan`：从最新 hard scan 的 `hardErrors` 派生的 `manual` 修复项（`dead-link` / `dead-reference` / `missing-docs-dir` / `has-reference` 等）。
- `softPlan`：从 agent 回填且通过校验的结果派生的 `manual` 或 `replace_text` 项。
- `rejected`：`garden-fix` schema 校验未通过的条目（来自 state.soft.rejected）。

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

前置：至少完成一次 `garden-scan`（或 `scan-hard` + `scan-soft`），且 agent 已按 agentDirective 渲染。

后置：`garden-polish` 处理单文档浅白润色。
