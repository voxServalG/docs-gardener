# garden-scan-hard

上层入口：[garden-scan](scan.md)。

`garden-scan-hard` 是硬校验层。它只做代码可判定的机械检查，不调用任何模型。

## 行为

- 遍历 `docsDir` 下所有 Markdown 文件。
- 报告以下类别：
  - `hardErrors`：`missing-docs-dir`、`line-limit`（>200 行）、`has-reference`、`dead-link`、`dead-reference`。
  - `warnings`：`stale-time`（>30 天未更新）。
  - `styleIssues`：`vague-term` 词表命中。
  - `coverage`：`documented` / `undocumented` / `staleMentions` 三类 surface 覆盖。
  - `architecture`：与默认文档架构角色的匹配 / 缺失情况。
- 不修改任何文件。
- 写状态缓存 `~/.docs-gardener/state.json`（可通过 `DOCS_GARDENER_STATE_DIR` 覆盖）。写失败时降级为内存并附 warning。

## 硬环节：agentDirective

envelope 的 `data.agentDirective.renderRequired = true` 表示 agent 必须以硬代码按 `renderSchema` 处理结果并向用户逐字汇报。未渲染时，后续 `garden-fix` / `garden-polish` 会直接拒绝。

## Envelope

- `tool` = `garden-scan-hard`
- `mode` = `hard`
- `phase` = `scan-hard`
- `next` = `garden-fix`
- `data.summary`：各类计数
- `data.files`：每个文档的机械 issue 详情
- `data.coverage`：surface 覆盖清单
- `data.architecture`：与默认架构角色的匹配报告
- `data.hash` / `data.previousHash` / `data.diff`：本次哈希、上次哈希、逐条差异
- `data.projectRoot`：绝对路径
- `data.agentDirective`：渲染契约

## 位阶

可任意时点重跑。不必与 `garden-scan-soft` 同时调用。
