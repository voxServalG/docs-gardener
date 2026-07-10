# docs-gardener Documentation

This directory is the documentation root scanned by docs-gardener.

Start with the [project overview](README.md).

Writing guidance: [plain writing guidance](plain-writing-guidance.md).

## Tools

Reference documents for each tool:

- Combined entry: [garden-scan](scan.md).
- Individual layers: [garden-scan-hard](scan-hard.md), [garden-scan-soft](scan-soft.md).
- Unified fix: [garden-fix](fix.md).
- Prose polish: [garden-polish](polish-tool.md).

## Built-in topology

```text
scan (unspecified)  ->  scan-hard + scan-soft in one call
scan-hard  /  scan-soft (either can be re-run at any time)
      │
      ▼
     fix (consumes latest cached hard + soft results)
      │
      ▼
    polish (single document, any time)
```

`garden-scan-hard` reports code-decidable hard errors, warnings, style hits, coverage, and architecture. It writes state to `~/.docs-gardener/state.json` (override with `DOCS_GARDENER_STATE_DIR`).

`garden-scan-soft` performs semantic review of documentation via MCP sampling. It calls the agent that invoked the tool to judge code-doc consistency, progressive disclosure, and prose claims, then returns validated findings directly. The envelope does not expose bundles, rubrics, or other intermediates.

`garden-scan` runs both layers and returns a combined envelope; use it when the user asks for a scan without specifying the layer.

`garden-fix` consumes the latest hard and soft scans from the cache and produces an approval-gated edit plan. It refuses to run if the latest scan has not been rendered per its `agentDirective`.

`garden-polish` prepares single-document plain-writing context. It does not fix links, split documents, or modify files.

`garden-grow` is only available when the configured docs directory has no Markdown files. It returns a bootstrap package and does not write files.

## Agent directive: hard render contract

Every `garden-scan-*` envelope carries `data.agentDirective` with `renderRequired = true`. Agents must consume the envelope with hard code, follow the provided `renderSchema`, and report findings to the user in natural language. The directive includes `forbiddenTerms` (bundle, rubric, pending, finding, prose-claims, progressive-disclosure, code-doc-consistency) that must never appear in user-facing output. `garden-fix` and `garden-polish` refuse to proceed until the latest scan has been rendered (or `forceRenderAck` is passed by automation).

## Consumer model

docs-gardener runs as an independent MCP server and CLI. Parallel projects can consume the JSON envelope directly; no external orchestrator is assumed. Soft scan requires an MCP client that supports sampling; CLI-only invocations return empty findings with a warning.
