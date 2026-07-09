# docs-gardener Documentation

This directory is the documentation root scanned by docs-gardener.

Start with the [project overview](README.md).

Writing guidance: [plain writing guidance](plain-writing-guidance.md).

## Tools

Reference documents for each tool:

- Hard layer: [garden-scan-hard](scan-hard.md), [garden-fix-hard](fix-hard.md).
- Soft layer: [garden-scan-soft](scan-soft.md), [garden-fix-soft](fix-soft.md).
- Prose polish: [garden-polish](polish-tool.md).

## Built-in topology

```text
garden-scan-hard -> garden-fix-hard -> garden-scan-soft -> garden-fix-soft -> garden-polish
```

`garden-scan-hard` reports code-decidable hard errors, warnings, style hits, coverage, and architecture.

`garden-fix-hard` only handles hard errors from `garden-scan-hard` and requires approval before modifying files.

`garden-scan-soft` prepares LLM review bundles for code-doc consistency, progressive disclosure, and prose claims. It does not call any model; the caller feeds the envelope to an LLM.

`garden-fix-soft` validates LLM findings against `findingSchema`, drops non-conforming ones, and produces an approval-gated edit plan.

`garden-polish` prepares single-document plain-writing context. It does not fix links, split documents, or modify files.

`garden-grow` is only available when the configured docs directory has no Markdown files. It returns a bootstrap package and does not write files.

## Consumer model

docs-gardener runs as an independent MCP server and CLI. Parallel projects can consume the JSON envelope directly; no external orchestrator is assumed.
