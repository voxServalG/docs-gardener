# garden-scan-soft

`garden-scan-soft` 是软校验层的准备阶段。它把 docs 与 code 打包成 LLM review bundle，工具本身不调用 LLM，也不修改任何文件。

## 输入

```json
{
  "categories": ["code-doc-consistency", "progressive-disclosure", "prose-claims"],
  "confidenceFloor": 0.6,
  "report": "<optional: garden-scan-hard data>"
}
```

- `categories`：省略等价于三类全出。
- `confidenceFloor`：低于该值的 finding 必须被 LLM 报为 `warning` 或 `note`。
- `report`：省略时 `scan-soft` 会自己先跑 `scan-hard`。

## 三类 bundle

### code-doc-consistency

每个 `documented` surface（CLI、MCP tool、config key、catalog item）一个 bundle。

- `docExcerpts`：surface 名字命中的文档段落 + 标题路径 + lineRange。
- `codeExcerpts`：根据 `surface.type` 用正则在 `catalogs.source` 与 `codeDirs` 下定位定义点（最多 3 处）。
- `notes`：找不到代码切片时明确要求 LLM 输出 `insufficient-context`，不要编造。

`allowedRules`：`drift-behavior`、`drift-signature`、`drift-boundary`、`drift-example`、`insufficient-context`。

### progressive-disclosure

整个文档树打包一个 bundle。每个节点只带 `path` / `headings` / `firstParagraph` / `incomingLinks` / `outgoingLinks` / `lineCount`，不带正文，避免 LLM 上下文溢出。

`allowedRules`：`entry-lacks-overview`、`duplicate-info`、`scope-jump`、`orphan-detail`、`dead-end`、`insufficient-context`。

### prose-claims

按文件切分。每个文件抽取声明性语句（禁止 / 保证 / 前置条件三类）。

`allowedRules`：`claim-unverifiable`、`claim-contradicted`、`claim-overreaches`、`insufficient-context`。

## Finding schema（LLM 必须遵守）

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

`fix-soft` 会强制走一遍 schema 校验：`rule` 必须属于该 bundle 的 `allowedRules`；`replace_text` 类型必须提供 `oldText` / `newText` 且 `oldText` 在目标文件里能命中一次。

## Envelope

- `tool` = `garden-scan-soft`
- `mode` = `soft`
- `phase` = `scan-soft`
- `next` = `garden-fix-soft`
- `data.hardSummaryRef`：绑定当前硬扫描摘要 hash；`fix-soft` 收到过期 ref 会拒绝。
- `data.bundles`：待 LLM 消化的 bundle 列表。
- `data.findingSchema` / `data.constraints`：LLM 侧硬约束。
- `requires_user` = `true`，`stop_here` = `true`：调用方必须把 envelope 交给 LLM，再手动调 `garden-fix-soft`。

## 位阶

前置：`garden-scan-hard` 已清空 hard errors。
后置：`garden-fix-soft`。
