# garden-fix-soft

`garden-fix-soft` 消化 LLM 回填的 findings，把它们转成需批准的编辑计划。它不调用 LLM。

## 输入

- `hardSummaryRef`：`garden-scan-soft` 返回的 hash。若与当前硬扫描摘要不符，工具拒绝并要求重跑 `garden-scan-soft`。
- `reports`：每个元素形如 `{ bundleId, findings: [...] }`。
- `approved`：`true` 时执行 `replace_text` 类型的编辑；未提供或 `false` 时只返回计划。

## 校验

每条 finding 都会走一遍强制校验：

- 必需字段：`rule` / `severity` / `confidence` / `evidence.docCitation` / `suggestion.type` / `suggestion.text`。
- `rule` 必须属于该 bundle 的 `allowedRules`。
- `severity ∈ {error, warning, note}`；`confidence ∈ [0, 1]`。
- `suggestion.type = replace_text` 时必须提供 `evidence.oldText` / `evidence.newText`，且 `oldText` 在 `docCitation` 所在文件里必须能命中一次；命不中会被拒绝。

校验失败的 finding 归入 `rejected` 数组并附具体 `reason`，不进入 `plan`。

## Envelope

- `tool` = `garden-fix-soft`
- `mode` = `soft`
- `phase` = `fix-soft-plan` / `apply`
- `next`：
  - 待批准：`garden-fix-soft`
  - 应用完成：`garden-polish`
- `data.accepted` / `data.rejected` / `data.plan`：分离后的状态。
- 未批准时 `requires_user = true`、`stop_here = true`。

## 位阶

前置：`garden-scan-soft` 已给出 bundle，LLM 已回填 findings。
后置：`garden-polish` 处理单文档浅白润色。
