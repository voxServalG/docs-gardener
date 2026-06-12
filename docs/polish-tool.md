# garden-polish

`garden-polish` 生成文档润色建议。它面向文档写作，不面向法律文本写作。

工具参考 [浅白写作指导](plain-writing-guidance.md)，目标是降低阅读摩擦，同时保留准确性。

## 行为

- 只读取 Markdown 文档。
- 不直接修改文件。
- 不自动调用 `garden-apply`。
- 跳过 fenced code block。
- 跳过包含 inline code 的行。
- 跳过包含 Markdown 链接的行，避免改动链接目标。
- 能安全给出替换时，输出 `edits`。
- 发现问题但不能安全改写时，输出 `findings`。

## Edit 格式

每条可应用建议固定使用四个字段：

```json
{
  "file": "docs/README.md",
  "oldText": "...",
  "newText": "...",
  "reason": "拆开长句，让安装步骤和行为说明分开。"
}
```

不要增加 `risk`、评分或软规则检查字段。

## Envelope

工具结果仍使用 agent-facing envelope。

- `display` 是给用户看的摘要。
- `hint` 是给 agent 的下一步提示。
- `requires_user` 表示需要用户审阅。
- `stop_here` 表示本轮应停下，不能自动应用。
- `allowedTools` 说明审阅后可调用的工具。
- `recovery` 说明失败后如何恢复。

如果存在 `edits` 或 `findings`，工具应要求用户审阅。只有用户接受的 edit 才能传给 `garden-apply`。
