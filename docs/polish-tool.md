# garden-polish

`garden-polish` 准备文档润色所需的上下文。它面向文档写作，不面向法律文本写作。

工具参考 [浅白写作指导](plain-writing-guidance.md)，目标是降低阅读摩擦，同时保留准确性。

## 行为

- 只读取 Markdown 文档。
- 不直接修改文件。
- 不自动调用 `garden-apply`。
- 不用正则替换或固定长度阈值生成润色建议。
- 返回文档内容、浅白写作指导、保护约束和固定 edit 格式。
- 由调用工具的大模型判断是否需要润色。
- 大模型提出 edit 后，仍需用户审阅。

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

工具本身不生成这些 edit。大模型应根据返回的文档、指导和约束生成 edit。

## Envelope

工具结果仍使用 agent-facing envelope。

- `display` 是给用户看的摘要。
- `hint` 是给 agent 的下一步提示。
- `requires_user` 表示需要用户审阅。
- `stop_here` 表示本轮应停下，不能自动应用。
- `allowedTools` 说明审阅后可调用的工具。
- `recovery` 说明失败后如何恢复。

工具应要求用户审阅大模型提出的 edit。只有用户接受的 edit 才能传给 `garden-apply`。
