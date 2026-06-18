# docs-gardener Documentation

This directory is the documentation root scanned by docs-gardener.

Start with the [project overview](README.md).

Writing guidance: [plain writing guidance](plain-writing-guidance.md).

Tool guidance: [garden-polish](polish-tool.md).

## Public workflow

The main document governance workflow is:

```text
garden-scan -> garden-fix -> garden-polish
```

`garden-scan` reports hard errors, warnings, style issues, coverage, and architecture findings.

`garden-fix` only handles hard errors from `garden-scan` and requires approval before modifying files.

`garden-polish` only prepares style and wording context. It does not fix links, split documents, or modify files.

`garden-grow` is available only when the configured docs directory has no Markdown files. It returns a bootstrap package and does not write files.
