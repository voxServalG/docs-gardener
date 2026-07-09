# garden-polish

`garden-polish` prepares context for style and wording review. It handles soft writing issues only.

The tool references [plain writing guidance](plain-writing-guidance.md). The goal is lower reading friction while preserving accuracy.

## Behavior

- Reads one Markdown document.
- Reads the plain writing guidance when present.
- Does not modify files.
- Does not fix hard structural problems.
- Does not fix links or split documents.
- Does not modify fenced code blocks.
- Does not modify inline code, commands, paths, field names, API names, or error codes.
- Returns document content, guidance, constraints, and a fixed edit schema.
- Requires the caller to show proposed edits to the user before applying them through the calling workflow.

## Edit format

Each proposed edit uses four fields:

```json
{
  "file": "docs/README.md",
  "oldText": "...",
  "newText": "...",
  "reason": "拆开长句，让安装步骤和行为说明分开。"
}
```

Do not add `risk`, scores, or soft-rule result fields.

The tool itself does not generate edits. The agent uses the returned document, guidance, and constraints to decide whether edits are needed.

## Envelope

The tool result uses the shared envelope:

- `ok` says whether the tool succeeded.
- `tool` is `garden-polish`.
- `mode` is `soft`.
- `phase` is `polish`.
- `next` is `review`.
- `summary` contains compact metadata.
- `data` contains the document, guidance, constraints, and edit schema.
- `requires_user` is `true`.
- `stop_here` is `true`.
