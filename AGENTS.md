<!-- hy-workflow-rules -->

## hy-workflow 硬性流程

你正在操作一个启用了 hy-workflow MCP 的项目。以下规则必须严格遵循。

### 项目产物边界

应提交的项目产物只有：
- `.github/workflows/hy-workflow.yml`
- `AGENTS.md`
- `.gitignore`
- `hy-workflow.json`

不应提交的本地、运行时、客户端产物：
- `.hy/`
- `.opencode/`
- `.codex/`
- `.mcp.json`
- `codelint.json`
- `doclint.json`
- `docs-gardener.json`

`hy-workflow.json` 是唯一人工维护配置源。doclint、codelint、docs-gardener 需要旧配置文件时，由 hy-workflow 在运行时临时生成兼容配置；不要把这些兼容 JSON 当成项目源文件。

MCP 客户端配置属于用户本地环境。只有在用户明确要求配置某个客户端时，才按该客户端的项目级 MCP 配置规范写入：
- OpenCode: `.opencode/opencode.json`
- Codex: `.codex/config.toml`
- Claude Desktop 或其他客户端: `.mcp.json` 或其项目级配置规范

客户端里需要两个 server：
- `hy-workflow`: `npx -y --prefer-online github:voxServalG/hy-workflow-mcp#main`
- `docs-gardener`: `npx -y --prefer-online github:voxServalG/docs-gardener mcp`

配置完成后，重启 agent/MCP session，并调用 `hy_init` 完成工作流状态初始化。`hy_init` 不会运行 setup，也不会启动交互式 TUI。

### 流程顺序（禁止跳过或重排）

初始化后，任何代码/文档任务自动走闭环：

`hy_status → hy_read_docs(before_plan) → hy_plan → hy_read_docs(before_approve) → hy_approve → hy_branch → hy_edit → hy_read_docs(after_edit) → hy_sync_docs → hy_verify → hy_commit → hy_ci → hy_merge → hy_chain`

`hy_read_docs` 是 agent 自动步骤，不是新增人类审核 gate。`hy_plan` 返回后，必须原样完整展示 `summary` 字段，等用户明确 approve 后才可继续。`hy_edit` 后必须先调用 `hy_read_docs(after_edit)`，再调用 `hy_sync_docs`，最后才调用 `hy_verify`。

`hy_verify` 若返回 `amend_required`，先展示 `suggestedAmendment`；用户明确批准后调用 `hy_amend_plan`，再重新走 `hy_read_docs(after_edit) → hy_sync_docs → hy_verify`。

### 各工具说明

**0. hy_init** — 项目首次使用时调用。验证 setup 已部署 bootstrap 产物，写入/更新 workflow 规则和本地忽略项，自动进 plan。不会在 MCP 内启动 setup 或交互式 TUI。

**1. hy_status** — 查看当前 phase 和下一步。后续任务从 `hy_status` 开始，不自行猜测阶段。

**2. hy_read_docs** — 在 `before_plan`、`before_approve`、`after_edit` 三个时点读取相关文档上下文。它是自动步骤，不等待用户审核。

**3. hy_plan** — 调用时传入 `{task, plan}`。自行利用工作区上下文构造 PlanDoc JSON。服务端通过 gate 校验 PlanDoc 质量，通过后方可进入 approve。

**4. hy_approve** — 用户审视 plan。严禁在用户未明确回复批准前调用 `hy_approve({approved:"approve"})`。必须等待用户对展示的 plan 做出认可。

**5. hy_branch** — 创建分支，`category ∈ {refactor, feat, chore, docs, ci, fix, test}`。

**6. hy_edit** — 锁定 scope，用 Read/Edit/Write 编辑，禁止编辑 plan.scope 未声明的文件。

**7. hy_sync_docs** — 编辑后同步文档关系和派生产物，必须在 `hy_read_docs(after_edit)` 之后、`hy_verify` 之前调用。

**8. hy_verify** — 全量校验: lint → compile → scope → boundary → platform → smoke → tests。失败回 hy_edit；`amend_required` 按上文流程修订计划；通过进 hy_commit。

**9. hy_commit** — git add + commit + push + gh pr create。

**10. hy_ci** — 等待 CI，红色回 hy_edit，全绿进 hy_merge。

**11. hy_merge** — 合并 PR，删除远程分支。

**12. hy_chain** — rebase 下游分支。无下游分支时传空数组。

**13. hy_reset** — PR 已合并且 hy_chain 完成后重置到 plan 阶段并清空当前工作数据；用户明确要求放弃当前开发任务时也可调用。

### 禁止操作

- 直接使用 `git checkout` / `git commit` / `git push` / `gh pr create`
- 跳过 `hy_read_docs` / `hy_sync_docs` / `hy_verify`
- 跳过 `hy_verify` 直接调 `hy_commit`
- `hy_approve` 驳回后自行推进
- 用户未明确 approve 前调用 approve
- 编辑 plan.scope 声明外的文件
- 提交本地或运行时目录及客户端配置：`.hy/`、`.opencode/`、`.codex/`、`.mcp.json`
- 提交运行时兼容配置：`codelint.json`、`doclint.json`、`docs-gardener.json`

### setup / bootstrap drift 处理

setup / `hy_init` 可能产生两类产物，必须分开处理：
- **应提交的 tracked project artifacts**: `.github/workflows/hy-workflow.yml`、`AGENTS.md`、`.gitignore`、`hy-workflow.json`
- **不应提交的 local/runtime artifacts**: `.hy/`、`.opencode/`、`.codex/`、`.mcp.json`、`codelint.json`、`doclint.json`、`docs-gardener.json`

如果 setup 后出现 diff，由 agent 自行判断如何把工作区调整到上面的理想状态；不要因为仍有本地产物就新增无关提交。不要把 setup 产生的 tracked artifact drift 混入无关代码/文档任务。

### Promotion / release 例外

baseBranch → releaseBranch 的 promotion（例如 dev → main）属于发布/晋级操作，不是普通开发任务。当用户明确要求“搞到 main”“promote dev to main”“发布到 main”时，不要伪造空 scope，也不要硬套 `hy_branch → hy_edit → hy_verify → hy_commit`。

promotion 操作必须满足：
- source 必须是已验证的 baseBranch（通常是 dev），target 必须是 releaseBranch（通常是 main）
- 先检查 `origin/<target>..origin/<source>` diff，确认只包含要发布的内容
- 创建或复用 promotion PR：base=`<target>`, head=`<source>`
- 等待 CI 全绿后再合并 PR
- 若需要直接使用 gh/git 执行 promotion，必须先获得用户明确授权
- 完成后可调用 `hy_reset` 清理 workflow 状态

普通代码/文档改动仍必须走完整 hy-workflow 闭环，禁止用 promotion 例外绕过开发流程。

### 关键输出规则

- **hy_plan summary 必须完整展示**：`hy_plan` 返回的 `summary` 字段内容必须原样、完整输出给用户审阅，不得摘要、压缩、改写或省略。
- **未完整展示前禁止 approve**：在用户看到完整 `summary` 之前，禁止调用 `hy_approve` 或自动推进到下一步。
- **命令字段纯 shell**：`entry_points`、`smoke`、`tests` 中的 `command` 必须是可直接执行的 shell 命令，不得写自然语言说明、括号注释或冒号说明；所有说明文字写入对应的 `description` 字段。

### hy_plan 使用

调用 `hy_plan({task: "描述你要做的任务", plan: { ... PlanDoc JSON ... }})`。构造 PlanDoc 时：
- 先用 Read/Glob/Grep 了解项目结构，确认每个文件路径存在
- task：描述解决的问题和动机，不是操作步骤列表
- dependency_dag：说明哪些模块受影响、哪些不受影响、依赖链方向
- entry_points：覆盖编译、lint、测试，每条对应一个验证维度
- `entry_points`、`smoke.command`、`tests.command` 必须是纯 shell 命令，命令后不得加括号说明、冒号说明或自然语言说明
- 说明文字统一写到 `description` 字段；PlanDoc JSON 字符串尽量避免未转义的反斜杠、反引号、引号和换行
- risks：每条含场景、影响、缓解措施，不写一句话标签
- discussion：含至少一个备选方案及否定理由

### approve 后自动推进

`hy_approve` 被输入 `approve` 通过后，返回结果包含 `pipeline` 数组和 `stopAfter`。按 pipeline 顺序逐条执行到 `stopAfter` 为止，不可跳步或调序。每完成一步，用简短语句向用户汇报当前进度。

任务完成标准不是 `hy_commit`，而是 PR 合并到 baseBranch 后调用 `hy_chain`（无下游分支时传空数组）并 `hy_reset` 回到 plan。`hy_commit → hy_ci → hy_merge → hy_chain → hy_reset` 中间除非工具返回 error、requires_user 或 stop_here（例如 CI 红、CI pending/API 异常、push/PR/merge/rebase 失败），否则不要停下。

### 失败处理

- `hy_verify` 失败: 编辑修复后重新 `hy_read_docs(after_edit) → hy_sync_docs → hy_verify`
- `hy_verify` 返回 `amend_required`: 展示 `suggestedAmendment`，等用户明确批准后调用 `hy_amend_plan`，再重新走 `hy_read_docs(after_edit) → hy_sync_docs → hy_verify`
- `hy_ci` 有红: 停下并展示结构化失败信息；编辑修复后重新 `hy_read_docs(after_edit) → hy_sync_docs → hy_verify → hy_commit → hy_ci`
- `hy_ci` pending/API 异常: 停下并展示结构化状态；不要进入 edit，等待后重试 `hy_ci`

所有工具返回均为 JSON，含 `next` 字段指示下一阶段。

<!-- /hy-workflow-rules -->
