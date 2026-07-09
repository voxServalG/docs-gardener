# garden-scan-soft

上层入口：[garden-scan](scan.md)。

`garden-scan-soft` 打包 LLM review bundle。工具本身不调用 LLM，也不修改任何文件。

## 输入

```json
{
  "categories": ["code-doc-consistency", "progressive-disclosure", "prose-claims"],
  "confidenceFloor": 0.6
}
```

- `categories`：省略等价于三类全出。
- `confidenceFloor`：低于该值的 finding 必须被 LLM 报为 `warning` 或 `note`。

若缓存中已有 hard scan 结果，则直接使用；否则先跑一次 hard scan。

## 三类 bundle

### code-doc-consistency

每个 `documented` surface（CLI、MCP tool、config key、catalog item）一个 bundle。

- `docExcerpts`：surface 名字命中的文档段落 + 标题路径 + lineRange。
- `codeExcerpts`：根据 `surface.type` 用正则在 `catalogs.source` 与 `codeDirs` 下定位定义点（最多 3 处）。
- `notes`：找不到代码切片时明确要求 LLM 输出 `insufficient-context`，不要编造。

`allowedRules`：`drift-behavior`、`drift-signature`、`drift-boundary`、`drift-example`、`insufficient-context`。

### progressive-disclosure

整个文档树打包一个 bundle。每个节点只带 `path` / `headings` / `firstParagraph` / `incomingLinks` / `outgoingLinks` / `lineCount`，不带正文。

`allowedRules`：`entry-lacks-overview`、`duplicate-info`、`scope-jump`、`orphan-detail`、`dead-end`、`insufficient-context`。

### prose-claims

按文件切分。每个文件抽取声明性语句。

`allowedRules`：`claim-unverifiable`、`claim-contradicted`、`claim-overreaches`、`insufficient-context`。

## Finding schema

```json
{
  "bundleId": "code-doc-consistency:garden-scan-hard",
  "rule": "drift-behavior",
  "severity": "error | warning | note",
  "confidence": 0.9,
  "evidence": {
    "docCitation": "docs/scan-hard.md:12-18",
    "codeCitation": "src/lib/scan-hard.js:30-52",
    "oldText": "...",
    "newText": "..."
  },
  "suggestion": {
    "type": "manual | replace_text",
    "text": "……"
  }
}
```

`garden-fix` 会强制走一遍 schema 校验：`rule` 必须属于该 bundle 的 `allowedRules`；`replace_text` 必须提供 `oldText` / `newText` 且 `oldText` 在目标文件里命中一次。

## 硬环节：agentDirective

envelope 携带 `data.agentDirective.renderRequired = true`，agent 必须按 `renderSchema` 硬代码处理并向用户汇报。未渲染时 `garden-fix` / `garden-polish` 拒绝。

## Envelope

- `tool` = `garden-scan-soft`
- `mode` = `soft`
- `phase` = `scan-soft`
- `next` = `garden-fix`
- `data.bundles`：待 LLM 消化的 bundle 列表。
- `data.hardSummaryRef`：绑定当前 hard scan 摘要。
- `data.hash` / `data.previousHash` / `data.diff`：本次哈希、上次哈希、bundle 变动。
- `data.findingSchema` / `data.constraints`：LLM 侧硬约束。
- `data.agentDirective`：渲染契约。

## 位阶

可任意时点重跑。若 hard scan 尚未缓存，工具自动补跑一次。
