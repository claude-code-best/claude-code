export const PR_TITLE = '添加 Claude Code GitHub 工作流'

export const GITHUB_ACTION_SETUP_DOCS_URL =
  'https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md'

export const WORKFLOW_CONTENT = `name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
      actions: read # 供 Claude 读取 PR 上的 CI 结果
    steps:
      - name: Checkout repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2, 2026-04-25
        with:
          fetch-depth: 1

      - name: 运行 Claude Code
        id: claude
        uses: anthropics/claude-code-action@567fe954a4527e81f132d87d1bdbcc94f7737434 # v1, 2026-04-25
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}

          # 可选：允许 Claude 读取 PR 的 CI 结果
          additional_permissions: |
            actions: read

          # 可选：向 Claude 提供自定义提示；不填则执行评论 @claude 时的说明
          # prompt: '更新 PR 描述，加入变更摘要。'

          # 可选：通过 claude_args 调整行为与配置
          # 见 https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md
          # 或 https://code.claude.com/docs/en/cli-reference
          # claude_args: '--allowed-tools Bash(gh pr:*)'

`

export const PR_BODY = `## 🤖 安装 Claude Code GitHub App

本 PR 添加 GitHub Actions 工作流，在本仓库中启用 Claude Code 集成。

### Claude Code 是什么？

[Claude Code](https://claude.com/claude-code) 是 AI 编程助手，可协助：
- 修复缺陷与改进代码  
- 更新文档
- 实现新功能
- 代码审查与建议
- 编写测试
- 等等

### 如何运作

合并本 PR 后，我们可在 Pull Request 或 Issue 评论中 @claude 与 Claude 交互。
工作流被触发后，Claude 会分析评论及上下文，并在 GitHub Action 中执行请求。

### 重要说明

- **工作流须等本 PR 合并后才生效**
- **@claude 在合并完成前不会生效**
- 在 PR 或 Issue 评论中提到 Claude 时会自动运行工作流
- Claude 可访问完整 PR/Issue 上下文，含文件、diff 与历史评论

### 安全

- Anthropic API 密钥以 GitHub Actions Secret 安全存储
- 仅对仓库有写权限的用户可触发工作流
- 每次 Claude 运行会记录在 GitHub Actions 运行历史中
- Claude 默认工具限于读写文件，以及通过评论、分支、提交与仓库交互。
- 可在工作流文件中增加允许的工具，例如：

\`\`\`
allowed_tools: Bash(npm install),Bash(npm run build),Bash(npm run lint),Bash(npm run test)
\`\`\`

更多信息见 [Claude Code action 仓库](https://github.com/anthropics/claude-code-action)。

合并本 PR 后，可在任意 PR 的评论里 @claude 试用！`

export const CODE_REVIEW_PLUGIN_WORKFLOW_CONTENT = `name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
    # 可选：仅在特定文件变更时运行
    # paths:
    #   - "src/**/*.ts"
    #   - "src/**/*.tsx"
    #   - "src/**/*.js"
    #   - "src/**/*.jsx"

jobs:
  claude-review:
    # 可选：按 PR 作者过滤
    # if: |
    #   github.event.pull_request.user.login == 'external-contributor' ||
    #   github.event.pull_request.user.login == 'new-developer' ||
    #   github.event.pull_request.author_association == 'FIRST_TIME_CONTRIBUTOR'

    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2, 2026-04-25
        with:
          fetch-depth: 1

      - name: 运行 Claude Code Review
        id: claude-review
        uses: anthropics/claude-code-action@567fe954a4527e81f132d87d1bdbcc94f7737434 # v1, 2026-04-25
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          plugin_marketplaces: 'https://github.com/anthropics/claude-code.git'
          plugins: 'code-review@claude-code-plugins'
          prompt: '/code-review:code-review \${{ github.repository }}/pull/\${{ github.event.pull_request.number }}'
          # 见 https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md
          # 或 https://code.claude.com/docs/en/cli-reference

`
