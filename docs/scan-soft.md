# garden-scan-soft

上层入口：[garden-scan](scan.md)。

`garden-scan-soft` 对文档进行语义级软扫描，直接返回已判读完毕的问题清单。工具内部通过 MCP sampling 完成判读，不暴露 bundle / rubric 等中间产物。

## 输入

```json
{
  "categories": ["code-doc-consistency", "progressive-disclosure", "prose-claims"],
  "confidenceFloor": 0.6
}
```

- `categories`：省略等价于三类全出。
- `confidenceFloor`：低于该值的 finding 应降级为 warning / note。

若缓存中已有 hard scan 结果，则直接使用；否则先跑一次 hard scan。

## 内部判读

工具对每个 bundle 调用 MCP sampling（`server.createMessage`），让当前调用 tool 的 agent 作为判读者。判读回传的 findings 经过 `findings-schema.js` 的 schema 校验：
- `rule` 必须属于该 bundle 的 `allowedRules`。
- `severity ∈ {error, warning, note}`；`confidence ∈ [0, 1]`。
- `replace_text` 类型必须提供 `oldText` / `newText` 且 `oldText` 在目标文件命中。

通过校验的 findings 直接写入 state 缓存；未通过的归入 `rejected`。

## CLI 限制

CLI 直接运行时没有 MCP 客户端，sampling 不可用。`scan-soft` 会返回空 findings 数组并在 envelope `warnings` 中标注 `sampling-unavailable`。要在实际环境中使用软扫描，请通过 MCP 客户端调用。

## 硬环节：agentDirective

envelope 携带 `data.agentDirective.renderRequired = true`，agent 必须按 `renderSchema` 硬代码处理并向用户汇报。渲染契约包含：
- `forbiddenTerms`：禁止在用户可见输出中出现的内部术语。
- `userRenderTemplate`：自然语言输出模板。
- `noSoftReviewTemplate`：sampling 不可用时的降级模板。

未渲染时 `garden-fix` / `garden-polish` 拒绝。

## Envelope

- `tool` = `garden-scan-soft`
- `mode` = `soft`
- `phase` = `scan-soft`
- `next` = `garden-fix`
- `data.findings`：已判读、已校验的问题数组。每条含 `severity`、`rule`、`confidence`、`location`、`message`、`evidence`、`suggestion`。
- `data.countsBySeverity`：按严重程度分组的计数。
- `data.rejected`：schema 校验未通过的条目（含 `reason`）。
- `data.hash` / `data.projectRoot` / `data.agentDirective`。
- `data.bundles` **不再存在**。
- `data.sampling`：判读执行统计（总数 / 成功 / 失败 / 耗时）。

## 位阶

可任意时点重跑。若 hard scan 尚未缓存，工具自动补跑一次。findings 直接写入 state，`garden-fix` 无需额外参数即可消费。
