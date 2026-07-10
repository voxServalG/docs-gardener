# garden-scan-soft

上层入口：[garden-scan](scan.md)。

`garden-scan-soft` 准备语义级审查所需的结构化证据。调用 agent 在正常响应周期内逐项判读，向用户输出自然语言结果，再把结构化结果回填给 `garden-fix`。

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

## Agent 判读

envelope 的 `data.bundles` 包含按类别组织的证据，`data.findingSchema` 与 `data.constraints` 约束输出。agent 必须审查每一组证据，并构造 `{ bundleId, findings }` 数组。`garden-fix` 使用 `findings-schema.js` 校验每条结果：
- `rule` 必须属于该 bundle 的 `allowedRules`。
- `severity ∈ {error, warning, note}`；`confidence ∈ [0, 1]`。
- `replace_text` 类型必须提供 `oldText` / `newText` 且 `oldText` 在目标文件命中。

通过校验的结果写入 state 缓存；未通过的归入 `rejected`。

CLI 与 MCP 返回相同的证据契约，不依赖 MCP sampling 能力。

## 硬环节：agentDirective

envelope 携带 `data.agentDirective.renderRequired = true`，agent 必须按 `renderSchema` 硬代码处理并向用户汇报。渲染契约包含：
- `forbiddenTerms`：禁止在用户可见输出中出现的内部术语。
- `userRenderTemplate`：自然语言输出模板。
- `agentSubmission`：回填 `garden-fix` 所需的结构。

未渲染时 `garden-fix` / `garden-polish` 拒绝。

## Envelope

- `tool` = `garden-scan-soft`
- `mode` = `soft`
- `phase` = `scan-soft`
- `next` = `garden-fix`
- `data.bundles`：结构化证据组。
- `data.findingSchema` / `data.constraints`：agent 输出契约与审查约束。
- `data.hash` / `data.projectRoot` / `data.agentDirective`。

## 位阶

可任意时点重跑。若 hard scan 尚未缓存，工具自动补跑一次。证据直接写入 state；agent 判读后以 `findings` 参数调用 `garden-fix`。
