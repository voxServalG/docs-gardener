# garden-fix-hard

`garden-fix-hard` 只处理 `garden-scan-hard` 报告的 hard errors。它是机械修复层：不调用模型，不做语义判断。

## 行为

- 若未提供 `report` 参数，则重新执行 `garden-scan-hard`。
- 为每条 hard error 生成一条 `plan` 项：
  - `dead-link` / `dead-reference` / `missing-docs-dir` / `has-reference` 全部是 `manual`，附具体指示。
- 未带 `approved: true` 时只返回计划，`requires_user = true`。
- 带 `approved: true` 时执行 `replace_text` 项目并写文件；`manual` 项目仍需人工处理。

## Envelope

- `tool` = `garden-fix-hard`
- `mode` = `hard`
- `phase` = `fix-hard-plan` / `apply`
- `next`：
  - 有硬错误、未批准：`garden-fix-hard`
  - 应用完成、硬错误清零：`garden-scan-soft`
  - 应用完成但仍有硬错误：`garden-fix-hard`

## 位阶

在 `garden-scan-hard` 之后调用。硬错误清空后进入 `garden-scan-soft` 打包 LLM review bundle。
