# ACP 合规性审计报告

> 生成日期: 2026-06-19
> 审计范围: src/services/acp/ 和 packages/acp-link/
> 对照规范: /Users/konghayao/code/knowledgebase/origin/acp/agent-client-protocol (commit 取自仓库 HEAD)

## 概览

- 总发现数: 53（其中部分为同根因跨维度交叉引用,如 image 能力声明问题在维度 1/3/7 各列一条并注明同根因；独立根因实际约 49 条）
- 按严重程度: critical 5 / major 17 / minor 20 / nit 11
- 涉及方法/字段:
  - `initialize` / `authenticate` / `logout`
  - `session/new` / `session/load` / `session/resume` / `session/fork` / `session/list` / `session/close`
  - `session/prompt` / `session/cancel` / StopReason / Usage
  - `session/update` 全部变体（usage_update、tool_call、tool_call_update、session_info_update）
  - `session/set_mode` / `session/set_config_option` / `session/set_model`
  - ContentBlock 处理（text / image / audio / resource / resourceLink / thought）
  - 权限委托（RequestPermissionOutcome、ToolKind、ToolCallLocation、terminal 生命周期）
  - 自定义传输（acp-link WS 代理、JSON-RPC envelope、`$/cancel_request`、能力协商）

## 修复优先级矩阵

| 优先级 | 维度 | 发现数 | 修复成本 | 是否阻断 |
|---|---|---|---|---|
| P0 | acp-link 传输层违反 JSON-RPC 2.0（维度 8） | 4 (2 critical + 2 major) | 高 | 是 |
| P0 | promptCapabilities.image 声明与实现脱节（维度 1/3/7） | 3 (3 major, 重复根因) | 低 | 是 |
| P0 | session/resume 重放历史违反 MUST NOT（维度 2） | 1 (1 critical) | 中 | 是 |
| P0 | session/update usage_update 非稳定 v1 判别器（维度 4） | 1 (1 critical) | 低 | ⚠️ **撤销**（interop 优先,见 §4.1） |
| P1 | PromptResponse.usage 非规范根字段（维度 3） | 1 (1 major) | 低 | ⚠️ **撤销**（同 §4.1 决策,根部 usage 与 _meta 镜像并存） |
| P1 | refusal stop_reason 丢失（维度 3） | 1 (1 major) | 低 | 否 |
| P1 | terminal 能力误用 `_meta` + 缺失标准生命周期（维度 5） | 2 (2 major) | 高 | 否 |
| P1 | 权限 `cancelled` 未传播为 StopReason::Cancelled（维度 5） | 1 (1 major) | 中 | 否 |
| P1 | setSessionMode 未发 current_mode_update（维度 6） | 1 (1 major) | 低 | 否 |
| P1 | session/load 跨项目 cwd 校验缺失（维度 2） | 1 (1 major) | 中 | 否 |
| P2 | 其他 minor / nit | 25 | 低-中 | 否 |

---

## 1. initialize / authenticate / logout + capabilities 协商（维度 1）

### 1.1 [major] image 能力声明与实际处理不符

- 位置: `src/services/acp/agent.ts:156` (initialize -> agentCapabilities.promptCapabilities) 配合 `src/services/acp/promptConversion.ts:9-25` (promptToQueryInput)
- 规范要求: PromptCapabilities.image (schema.json:2126-2130 + initialization.mdx:168-170): "The prompt may include ContentBlock::Image"。initialization.mdx:108 "Clients and Agents MUST treat all capabilities omitted in the initialize request as UNSUPPORTED"——反过来说,声明 `image: true` 即承诺 Client 可发送 ContentBlock::Image 且 Agent 会处理。
- 当前实现: initialize 返回 `promptCapabilities: { image: true, embeddedContext: true }`（未声明 audio,默认 false,正确）。但 promptToQueryInput() 只处理 `type==='text'`、`'resource_link'`、`'resource'` 三类 block；`'image'` block 无对应分支,被静默丢弃。prompt() (agent.ts:269) 把整个 prompt 压成纯字符串 promptInput 传给 QueryEngine.submitMessage()。Client 若信任 `image:true` 发来图片,Agent 会完全忽略,不报错也不转换。
- 修复建议: 二选一。

  (A) 若确实不处理图片,把 `promptCapabilities.image` 改为 false（或删除该键,默认 false）:

  ~~~diff
   promptCapabilities: {
  -  image: true,
     embeddedContext: true,
   },
  ~~~

  (B) 若要保留图片能力,在 promptToQueryInput 中处理 image block,将其作为 image content block 注入 query input（需 QueryEngine.submitMessage 支持多模态输入）:

  ~~~diff
   } else if (b.type === 'image') {
  +  const img = b as { source?: { data?: string; media_type?: string } }
  +  images.push({ data: img.source?.data, mediaType: img.source?.media_type })
   }
  ~~~

  然后扩展 submitMessage 接受 images 数组。在多模态 query input 支持完成前,推荐先采用 (A)。

### 1.2 [minor] sessionCapabilities.fork 为非稳定 v1 字段

- 位置: `src/services/acp/agent.ts:164-169` (sessionCapabilities: { fork: {}, list: {}, resume: {}, close: {} })
- 规范要求: 稳定 v1 SessionCapabilities (schema.json:2528-2571) 仅定义属性 `_meta` / `close` / `list` / `resume`,无 fork。SDK 自带 schema (node_modules/@agentclientprotocol/sdk/schema/schema.json:5139-5148) 明确标注 fork 为 "UNSTABLE — This capability is not part of the spec yet, and may be removed or changed at any point"。本审计只覆盖稳定 v1,draft/unstable 不在合规范围。
- 当前实现: sessionCapabilities 中包含 `fork: {}` 以配合已实现的 `unstable_forkSession()` (agent.ts:235)。但稳定 v1 schema 的 SessionCapabilities 不认识此键。由于 schema 未设 `additionalProperties:false`,字段不会导致 schema 校验硬失败,但严格 Client 会把它当作未知扩展忽略,无法据此发现 session/fork 支持。
- 修复建议: 将 unstable fork 能力迁移到 AgentCapabilities._meta 下的自定义扩展命名空间（与现有 `_meta.claudeCode.promptQueueing` 同模式）,符合 extensibility.mdx:111-134 "Advertising Custom Capabilities":

  ~~~diff
   agentCapabilities: {
     _meta: {
  -    claudeCode: { promptQueueing: true },
  +    claudeCode: { promptQueueing: true, forkSession: true },
     },
     promptCapabilities: { image: true, embeddedContext: true },
     mcpCapabilities: { http: true, sse: true },
     loadSession: true,
     sessionCapabilities: {
  -    fork: {},
       list: {},
       resume: {},
       close: {},
     },
   },
  ~~~

### 1.3 [nit] 缺失 authMethods 字段

- 位置: `src/services/acp/agent.ts:127-172` (initialize 返回值)
- 规范要求: InitializeResponse (schema.json:1487-1548) authMethods 默认 [] (schema.json:1528-1535)。authentication.mdx:37 "Agents advertise authentication options in the authMethods field of the initialize response"。虽然默认 [] 使字段可选,但显式返回 `authMethods: []` 更利于 Client 明确判断"无需认证"而非"能力未知"。
- 当前实现: initialize 返回值不含 authMethods 字段。authenticate() (agent.ts:176-181) 忽略 params.methodId 直接返回 `{}`,意味着即使 Client 用任意 methodId 调 authenticate 也会成功——但因 authMethods 缺失,规范上 Client 不应调用 authenticate。
- 修复建议: 显式返回 `authMethods: []` 以明示无认证方法,与 authenticate() 的 no-op 语义一致:

  ~~~diff
   return {
     protocolVersion: 1,
  +  authMethods: [],
     agentInfo: { ... },
     agentCapabilities: { ... },
   }
  ~~~

  同时建议在 authenticate() 中校验:因未声明任何 method,若被调用应返回 method-not-found 错误（code -32601）,而非无条件成功。

---

## 2. Session 生命周期:新建 / 加载 / 恢复 / 分叉 / 列出 / 关闭（维度 2）

### 2.1 [critical] session/resume 重放完整历史违反 MUST NOT

- 位置: `src/services/acp/agent.ts:193-199` (unstable_resumeSession) → getOrCreateSession (688-777) → replaySessionHistory (792-816) / replayHistoryMessages (757-769)
- 规范要求: docs/protocol/session-setup.mdx "Resuming a Session": "Unlike session/load, the Agent MUST NOT replay the conversation history via session/update notifications before responding. Instead, it restores the session context, reconnects to the requested MCP servers, and returns once the session is ready to continue."
- 当前实现: unstable_resumeSession 委托给 getOrCreateSession,这是 loadSession 使用的相同代码路径。对于在内存中找到的会话,它会调用 replaySessionHistory() (第 713 行)；对于从磁盘加载的会话,它会调用 replayHistoryMessages() (第 757-769 行)。无论哪种方式,完整的对话历史都会在返回 ResumeSessionResponse 之前通过 session/update 通知流式传输回客户端。因此 session/resume 的行为与 session/load 完全一致,违反了 MUST NOT 重放规则。
- 修复建议: 将恢复路径与加载路径分离。添加一个不执行重放的 resumeSession() 实现:

  ~~~diff
   async unstable_resumeSession(
     params: ResumeSessionRequest,
   ): Promise<ResumeSessionResponse> {
  -  const result = await this.getOrCreateSession(params)
  +  const result = await this.getOrCreateSession({ ...params, replay: false })
     this.scheduleAvailableCommandsUpdate(result.sessionId)
     return result
   }
  ~~~

  在 getOrCreateSession 中,根据 `replay` 标志控制两个 replayHistoryMessages/replaySessionHistory 调用,让 resume 传递 `replay:false`（恢复时仅恢复上下文 + MCP 连接,然后立即返回 `{ modes, models, configOptions }`）。保留 loadSession 的默认 `replay:true`。

### 2.2 [major] session/load 跨项目 cwd 校验缺失

- 位置: `src/services/acp/agent.ts:688-777` (getOrCreateSession) 和 resolveSessionFilePath in `src/utils/sessionStoragePortable.ts:401-464`
- 规范要求: docs/protocol/session-setup.mdx "Working Directory": "This directory MUST be an absolute path MUST be used for the session regardless of where the Agent subprocess was spawned."
- 当前实现: createSession() 从 {cwd, mcpServers} 计算 sessionFingerprint (agent.ts:665-670),而 getOrCreateSession() 仅在请求的会话已驻留在 this.sessions (第 696-721 行) 时才将指纹与该内存中的会话进行比较。当会话不在内存中时（正常的恢复/加载情况）,代码会调用 resolveSessionFilePath(sessionId, cwd),该方法会搜索请求的目录、其 git 工作树,最后扫描所有项目目录 (sessionStoragePortable.ts:410-463)。没有任何检查验证会话原始的 cwd 是否与请求的 cwd 匹配。客户端可以传入项目 A 的 cwd 并成功加载项目 B 下持久化的会话,然后运行一个上下文错误的会话。在基于磁盘的路径上从未计算或比较过指纹。
- 修复建议: 在解析文件路径后,从磁盘上的会话中读取原始的 cwd（第一条消息的 'cwd' 字段）,并将其与请求的 cwd 进行比较。如果不匹配,返回错误（JSON-RPC 错误代码 -32602 无效参数）:

  ~~~ts
  const resolved = await resolveSessionFilePath(params.sessionId, params.cwd)
  if (resolved) {
    const lite = await readSessionLite(resolved.filePath)
    const originalCwd = lite && extractJsonStringField(lite.head, 'cwd')
    if (originalCwd && path.resolve(originalCwd) !== path.resolve(params.cwd)) {
      throw new RpcError(-32602, `Session cwd mismatch: session belongs to ${originalCwd}, requested ${params.cwd}`)
    }
  }
  ~~~

  或者,在加载会话的 cwd 不同时跳过工作树/全目录回退搜索,以便跨项目加载自然失败。

### 2.3 [major] unstable_forkSession 忽略源会话 ID,创建空白会话

- 位置: `src/services/acp/agent.ts:235-245` (unstable_forkSession)
- 规范要求: schema/schema.unstable.json ForkSessionRequest: required = ["sessionId", "cwd"]；描述为 "The ID of the session to fork."。Agent 在 initialize (agent.ts:165) 中通过 `sessionCapabilities.fork:{}` 声称支持分叉。
- 当前实现: unstable_forkSession 忽略了 params.sessionId（要分叉的源会话）和 params.additionalDirectories。它只是调用 `this.createSession({ cwd, mcpServers, _meta })` 来构建一个全新的空会话,与源会话没有任何共享的历史/上下文。一个本应从源会话上下文分支出来的 "fork" 实际上创建了一个空白会话。新会话的 ID 被返回,但源会话的对话未恢复,因此分叉在功能上是错误的。
- 备注: 尽管 fork 是 UNSTABLE 且超出了严格的 v1 合规范围,但 Agent 声明了该能力并注册了处理程序,因此客户端调用 `session/fork` 将获得语义错误的结果。
- 修复建议: 将源会话的消息加载到内存中（通过 getLastSessionLog(params.sessionId)）,并将它们作为 initialMessages 传递给 createSession,同时转发 additionalDirectories:

  ~~~ts
  async unstable_forkSession(params: ForkSessionRequest): Promise<ForkSessionResponse> {
    let initialMessages: Message[] | undefined
    try {
      const log = await getLastSessionLog(params.sessionId as UUID)
      if (log?.messages.length) initialMessages = deserializeMessages(log.messages)
    } catch (err) { console.error('[ACP] fork source load failed:', err) }
    const response = await this.createSession(
      { cwd: params.cwd, mcpServers: params.mcpServers ?? [], _meta: params._meta, additionalDirectories: params.additionalDirectories },
      { initialMessages },
    )
    this.scheduleAvailableCommandsUpdate(response.sessionId)
    return response
  }
  ~~~

  （扩展 createSession 签名以接受并持久化 additionalDirectories。）

### 2.4 [minor] listSessions 静默截断为 100 并忽略 cursor 分页

- 位置: `src/services/acp/agent.ts:211-231` (listSessions) 和 `src/utils/listSessionsImpl.ts:439-454`
- 规范要求: docs/protocol/session-list.mdx "Pagination": "Clients MUST treat cursors as opaque tokens ... Agents SHOULD return an error if the cursor is invalid." ListSessionsRequest.cursor 是一个可选的不透明分页 token (schema.json:1597)。
- 当前实现: listSessions 完全忽略了 params.cursor。它调用 `listSessionsImpl({ dir: params.cwd ?? undefined, limit: 100 })`——一个硬编码的 100 条目上限,没有偏移量,也没有消费 cursor。响应从不返回 nextCursor,因此跨大历史记录的分页静默失败:拥有超过 100 个会话的客户端只能看到最近的 100 个,无法获取其余的。无效的 cursor 被静默接受（规范指出 Agent 应该报错）。虽然返回不带 nextCursor 的所有结果是允许的,但静默截断为 100 违反了 "Clients MUST treat a missing nextCursor as the end" 的契约,因为 Agent 实际上有更多结果却隐瞒了。
- 修复建议: 要么 (a) 完全去掉硬编码的 100 限制（如果没有更多结果,返回所有会话且不带 nextCursor 是合规的）,或者 (b) 实现 cursor→offset 解码:

  ~~~ts
  const decoded = params.cursor
    ? JSON.parse(Buffer.from(params.cursor, 'base64').toString())
    : { offset: 0 }
  const candidates = await listSessionsImpl({ dir: params.cwd, limit: PAGE_SIZE, offset: decoded.offset })
  const nextCursor = candidates.length === PAGE_SIZE
    ? Buffer.from(JSON.stringify({ offset: decoded.offset + PAGE_SIZE })).toString('base64')
    : undefined
  return { sessions: [...], nextCursor }
  ~~~

  至少,当客户端发送 params.cursor 时（因为分页未实现）,返回一个错误,这样客户端就不会得到静默错误的结果。

### 2.5 [nit] listSessions 对无标题会话发出空字符串 title

- 位置: `src/services/acp/agent.ts:219-228` (listSessions 会话映射)
- 规范要求: schema.json SessionInfo (2787): title 是 type `["string","null"]`（可选,可为空）。docs/protocol/session-list.mdx: "Human-readable title for the session. May be auto-generated from the first prompt."
- 当前实现: 对于每个候选者,代码无条件地发出 `title: sanitizeTitle(candidate.summary ?? '')`。当会话没有可提取的摘要/标题时（边缘情况下 candidate.summary 为空字符串）,Agent 发出 `title: ""`。空字符串技术上是有效的,但没有信息量；根据 schema,省略 title 会更清晰。这是一个表面问题,因为基于磁盘的候选者很少幸存于空摘要。
- 修复建议: 仅在非空时包含 title:

  ~~~diff
  + const title = sanitizeTitle(candidate.summary ?? '')
   sessions.push({
     sessionId: candidate.sessionId,
     cwd: candidate.cwd,
  -  title: sanitizeTitle(candidate.summary ?? ''),
  +  ...(title ? { title } : {}),
     updatedAt: new Date(candidate.lastModified).toISOString(),
   })
  ~~~

  updatedAt 的 ISO 8601 格式（new Date(ms).toISOString() → 例如 '2025-10-29T14:22:15.123Z') 已经合规。

### 2.6 [nit] NewSessionResponse 不含 cwd,但规范本身不要求

- 位置: `src/services/acp/agent.ts:185-189` (newSession) → createSession 返回 675-680
- 规范要求: schema.json NewSessionResponse (1916) 要求仅 `['sessionId']`；cwd 不在响应模式中。
- 当前实现: newSession 返回 `{ sessionId, models, modes, configOptions }`。sessionId（唯一必填字段）存在。cwd 不返回,但 schema 从未要求在响应中返回 cwd（cwd 是 session/new 的请求侧输入,如 docs/protocol/session-setup.mdx 第 52-68 行示例响应第 77-80 行所示,仅返回 `{ sessionId }`）。因此相对于规范没有违规；记录此内容以解决审计检查清单中的错误前提。
- 修复建议: 无需代码更改。只需更新内部审计检查清单,停止期望在 NewSessionResponse 中有 cwd。

---

## 3. session/prompt + session/cancel + stop reason + usage（维度 3）

### 3.1 [critical] image 能力声明与实际丢弃不符

- 位置: `src/services/acp/agent.ts:155-158` (initialize) + `src/services/acp/promptConversion.ts:9-25` (promptToQueryInput)
- 规范要求: PromptRequest.prompt is ContentBlock[]；Clients MUST restrict content types according to PromptCapabilities (prompt-turn.mdx:89-98)。Agent advertises `promptCapabilities.image: true`, signalling it accepts image content blocks.
- 当前实现: initialize() 声明 `promptCapabilities: { image: true, embeddedContext: true }`,但 promptToQueryInput() 只处理 block types `'text'`、`'resource_link'`、`'resource'`。任何 `type: 'image'` block（以及任何非文本/非资源 block）被静默丢弃——只产生字符串连接的文本,所以 image 输入无警告消失。没有通过文件系统或错误暴露 image 的回退。
- 修复建议: 要么停止宣告 image 支持直到它被接通,要么扩展 promptToQueryInput 以暴露 image block。最小正确修复:

  ~~~diff
   promptCapabilities: {
  -  image: true,
  +  image: false,
     embeddedContext: true,
   },
  ~~~

  如果打算 image passthrough,query input 必须携带 image 数据——例如返回一个结构化输入,携带 `{ type: 'image', source: {...} }` block 而不是 flat string。在此之前,能力声明是协议谎言,使客户端发送 agent 永远看不到的 image。此问题与维度 1 的 §1.1 同根因。

### 3.2 [major] PromptResponse.usage 为非规范根字段

- 位置: `src/services/acp/agent.ts:326-340` (prompt return) 和 `src/services/acp/bridge.ts:756,1059` (forwardSessionUpdates return type)
- 规范要求: Stable v1 schema: PromptResponse (schema/schema.json:2163-2184) 只定义 `stopReason`（必填）和 `_meta`（可选）。extensibility.mdx:39 states: "Implementations MUST NOT add any custom fields at the root of a type that's part of the specification. All possible names are reserved for future protocol versions." `usage`/`TokenUsage` does not exist anywhere in the stable schema。
- 当前实现: prompt() 返回 `{ stopReason, usage: { inputTokens, outputTokens, cachedReadTokens, cachedWriteTokens, totalTokens } }`。`usage` 是非规范根字段。它碰巧匹配 bundled SDK schema (schema.json:4656-4665 marked **UNSTABLE**) 中的 UNSTABLE 形状,但那超出了 v1 合规范围。
- 修复建议: 停止为 v1 合规性在 PromptResponse 上发出 `usage`,或将其置于能力协商之后。最干净的修复:

  ~~~diff
  -return { stopReason, usage }
  +return { stopReason }
  ~~~

  如果需要 token 报告,通过现有的 `usage_update` SessionUpdate 发送（已在 bridge.ts:843-854 完成,见维度 4 的 critical finding——但 usage_update 本身也是非稳定的）和/或将其移至 `_meta`——但根据 extensibility.mdx:39,即使是未知的根键也被保留,因此唯一规范一致的位置是 `_meta.usage`。推荐:

  ~~~ts
  return { stopReason, _meta: usage ? { claudeCode: { usage } } : undefined }
  ~~~

### 3.3 [major] Anthropic refusal stop_reason 被误报为 end_turn

- 位置: `src/services/acp/bridge.ts:866-876` (success case stop_reason mapping)
- 规范要求: StopReason enum (schema.json:3212-3241) includes `refusal`——"The turn ended because the agent refused to continue." prompt-turn.mdx:278 defines refusal as a first-class stop reason。Anthropic API can return `stop_reason: 'refusal'` on safety refusals。
- 当前实现: 在 `success` 情况下只映射了 `'max_tokens'`；其他所有 Anthropic stop_reason（包括 `'refusal'`、`'end_turn'`、`'stop_sequence'`、`'tool_use'`）都落入默认 `stopReason = 'end_turn'`。没有分支将 `'refusal'` 映射到 ACP `refusal` stop reason,因此真正的拒绝被误报为成功的 end_turn,破坏了规范契约——refusal 应被反映（根据 refusal 语义,prompt 不应包含在下一轮）。
- 修复建议: 添加显式映射:

  ~~~diff
   case 'success': {
  -  const stopReasonStr = msg.stop_reason
  -  if (stopReasonStr === 'max_tokens') {
  -    stopReason = 'max_tokens'
  -  }
  -  if (isError) {
  -    // Report error as end_turn
  -    stopReason = 'end_turn'
  -  }
  +  const r = msg.stop_reason
  +  if (r === 'max_tokens') stopReason = 'max_tokens'
  +  else if (r === 'refusal') stopReason = 'refusal'
  +  else stopReason = 'end_turn'
  +  if (isError) stopReason = 'end_turn'
     break
   }
  ~~~

### 3.4 [minor] max_tokens 与 isError 检查相互覆盖

- 位置: `src/services/acp/bridge.ts:866-876` (success case) 和 877-886 (error_during_execution case)
- 规范要求: StopReason `max_tokens` (schema.json:3221-3223): "The turn ended because the agent reached the maximum number of tokens." prompt-turn.mdx:271-272。
- 当前实现: `max_tokens` 检查和 `isError` 检查是两个独立的 `if` 语句,不是 `else if`。当 `stop_reason === 'max_tokens'` 且 `isError === true` 时,第一个 `if` 设置 `stopReason = 'max_tokens'`,但第二个 `if` 立即覆盖为 `end_turn`。同样的缺陷也出现在 error_during_execution (877-886):max_tokens 可能被设置然后被覆盖。SDK 标记为错误的 max-tokens 终止因此被报告为 end_turn,向客户端隐藏了真正的原因。
- 修复建议: 使分支互斥或将 isError 仅作为回退（见 §3.3 的合并修复 diff）。

### 3.5 [minor] prompt 未读取 params._meta,trace context 丢失

- 位置: `src/services/acp/agent.ts:262-287` (prompt queue handling) 和 269 (params._meta not read)
- 规范要求: extensibility.mdx:8-39——`_meta` 是每个类型的保留扩展点,包括 PromptRequest (schema.json:2137-2141)。W3C trace context keys (`traceparent`、`tracestate`、`baggage`) SHOULD be propagated for OpenTelemetry interop (extensibility.mdx:33-38)。prompt-queue feature 只在 agentCapabilities 级别宣告（agent.ts:150-154 `_meta.claudeCode.promptQueueing: true`) 是正确的地方。
- 当前实现: prompt() 从不读取 `params._meta`。两个后果: (1) prompt 中客户端提供的 W3C trace context (`traceparent`/`tracestate`/`baggage`) 被静默丢弃,破坏了 tracing interop；(2) prompt-queueing 扩展已宣告,但没有 per-request opt-out 机制——客户端无法通过 `_meta` 信号 skip-queue。能力宣告本身是合规的。
- 修复建议: 将 `params._meta` 传递给 query 层,以便 trace context 可以附加到下游 API 调用,并可选地遵守 `_meta.claudeCode.skipQueue` flag。至少,转发 traceparent:

  ~~~ts
  const traceparent = params._meta?.traceparent
  // thread it into the API client request headers
  ~~~

### 3.6 [minor] prompt catch 块对 abort 信号竞态返回错误而非 cancelled

- 位置: `src/services/acp/agent.ts:342-359` (prompt catch block)
- 规范要求: prompt-turn.mdx:304-311 (Warning): "Agents MUST catch these errors and return the semantically meaningful `cancelled` stop reason, so that Clients can reliably confirm the cancellation." 这适用于中止操作产生的错误。当 session.cancelled 为 true 时,catch 块必须为任何错误返回 cancelled。
- 当前实现: catch 块确实检查 `if (session.cancelled) return { stopReason: 'cancelled' }` (343-345)——对于进程内 cancelled flag 是正确的。然而,守卫使用 `session.cancelled`,只由 cancel() 设置。如果 QueryEngine 的 abort signal 通过 interrupt() 触发,但 session.cancelled 尚未设置（interrupt() 完成和 cancel() 到达第 379 行之间的竞态窗口）,或从嵌套路径传播取消派生的 AbortError,条件为 false,错误被重新抛出为 JSON-RPC 错误而不是 cancelled stop reason。更稳健的信号是 abort signal 本身。
- 修复建议: 在 flag 之外检查 abort signal,并将 AbortError/abort 形状错误视为取消:

  ~~~ts
  } catch (err) {
    const isAbort = err instanceof Error && (
      err.name === 'AbortError' || /abort|cancelled|interrupt/i.test(err.message)
    )
    if (session.cancelled || isAbort) {
      return { stopReason: 'cancelled' }
    }
    // ...existing process-death + rethrow
  }
  ~~~

### 3.7 [minor] 空 prompt 提前返回 end_turn 语义错误

- 位置: `src/services/acp/agent.ts:271-273` (empty prompt early return)
- 规范要求: prompt-turn.mdx:185-199——Agent MUST respond to session/prompt with a StopReason when the turn ends。schema 没有定义空 prompt 的行为；StopReason `end_turn` (schema.json:3216-3218) 描述为 "The turn ended successfully," 暗示实际模型处理已发生。
- 当前实现: `if (!promptInput.trim()) return { stopReason: 'end_turn' }` 在不调用模型的情况下返回 end_turn。语义上,这为 no-op 输入报告成功的 turn,这是误导性的:模型从未运行。也没有路径区分 "空 prompt 无效" 和 "turn 完成"。
- 修复建议: 要么拒绝空 prompt 与 JSON-RPC 错误（invalid_params, -32602）,因为 `prompt` 是必需的 ContentBlock[] 而有效空消息可能是畸形的,或至少文档说明 end_turn 在这里意味着 "nothing to do"。优先抛出:

  ~~~diff
  -if (!promptInput.trim()) return { stopReason: 'end_turn' }
  +if (!promptInput.trim()) throw new RpcError(-32602, 'Prompt content is empty')
  ~~~

### 3.8 [nit] usage 对象缺少 thoughtTokens

- 位置: `src/services/acp/agent.ts:328-339` (usage object construction)
- 规范要求: Bundled (UNSTABLE, out of v1 scope) SDK Usage (node_modules/@agentclientprotocol/sdk/schema/schema.json:6750-6791) has required `totalTokens/inputTokens/outputTokens` and optional `cachedReadTokens`、`cachedWriteTokens`、`thoughtTokens`。Stable v1 has no Usage at all。
- 当前实现: 构造的 usage 对象省略 `thoughtTokens`（reasoning/thinking tokens）。对于发出 reasoning tokens 的模型,报告的 totalTokens (input+output+cachedRead+cachedWrite) 将低估实际计费 tokens,因为 thinking tokens 被排除在总和之外。
- 修复建议: 如果报告 usage（见 §3.2 extra-field finding）,包括可用的 thinking tokens:

  ~~~ts
  totalTokens: inputTokens + outputTokens + cachedReadTokens + cachedWriteTokens + thoughtTokens
  ~~~

  注意,这只在 unstable contract 下重要；对于严格的 v1 合规性,整个 usage 字段应被移除。

---

## 4. session/update 通知形状（所有 update 变体）（维度 4）

### 4.1 [critical] usage_update 非稳定 v1 SessionUpdate 判别器 🔶 已撤销原修复 (2026-06-19)

- 位置: `src/services/acp/bridge/forwarding.ts` (forwardSessionUpdates, 'result' 情况)
- 规范要求: ACP v1 稳定版 schema schema.json:2942-3108 定义 SessionUpdate 为通过 propertyName `sessionUpdate` 进行 oneOf 判别,包含 10 个有效常量: `user_message_chunk`、`agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update`、`plan`、`available_commands_update`、`current_mode_update`、`config_option_update`、`session_info_update`。`usage_update` 不在 v1 稳定版规范中。（Claude Code 捆绑的 SDK schema v0.19.0 第 5789 行将其标记为 "UNSTABLE——此功能尚未包含在规范中,随时可能被删除或更改"。）
- **决策回滚**: 原修复（2026-06-19 早期）完全移除了 `usage_update` 以追求严格 v1 stable 合规。但现实中所有主流 ACP 客户端（Zed、Cursor 等）实现的是 unstable spec,移除 `usage_update` 后客户端 context 使用量一律显示 `0/0`,严重破坏 UX。鉴于:
  - SDK 已包含 `UsageUpdate` 类型(`sessionUpdate: 'usage_update'`, 字段 `used` + `size` + 可选 `cost`)
  - `PromptResponse.usage` 也已由 SDK 在根部支持(UNSTABLE 但被广泛实现)
  - 这是 context 使用量报告的**唯一**标准化载体

  现行实现选择**优先保证 interop**: 在 'result' 消息后发送 `usage_update`,并在 PromptResponse 根部填充 `usage`。同时保留 `_meta.claudeCode.usage` 作为厂商扩展命名空间下的镜像,以便消费者任选读取路径。
- 当前实现: `bridge/forwarding.ts` 在收到 'result' 消息且 `lastAssistantTotalUsage !== null` 时发出 `usage_update`:
  - `used` = 最近一条 assistant 消息的 input + output + cache_read + cache_creation token 总和（≈ 当前上下文占用）
  - `size` = `lastContextWindowSize`（默认 200000，通过 modelUsage prefix-match 解析）
  - compact_boundary 时不发（不知道压缩后的实际占用；下一轮的 result 会自然修正）
- 同步调整: `agent/promptFlow.ts` 在 PromptResponse 根部添加 `usage: { totalTokens, inputTokens, outputTokens, thoughtTokens, cachedReadTokens, cachedWriteTokens }`,并镜像到 `_meta.claudeCode.usage`。

### 4.2 [minor] 从未发出 tool_call in_progress 状态 ✅ 已修复 (2026-06-19)

- 位置: `src/services/acp/bridge.ts` `toAcpNotifications` 的 `tool_use` 分支 alreadyCached 路径
- 规范要求: schema.json:3525-3548 ToolCallStatus 枚举为 `pending`、`in_progress`、`completed`、`failed`。tool-calls.mdx:76-91 ('Updating') 文档化了一个生命周期,其中 Agent 在工具实际运行时报告 `status: 'in_progress'`。v1 规范称工具 "在其生命周期中会经历不同状态"。
- 修复: 当同一 tool_use 块被第二次遇到时(streaming `content_block_start` 首次 + assistant 完整消息回放第二次),发 `tool_call_update` with `status: 'in_progress'`。此时语义为"input 已收齐,即将执行"。完整 ToolCallStatus 生命周期现在是 pending → in_progress → completed|failed。
- 修复建议: 当 Claude Code 知道工具开始执行时,发出一个中间的 tool_call_update:

  ~~~ts
  { sessionUpdate: 'tool_call_update', toolCallId, status: 'in_progress' }
  ~~~

  如果无法获得执行挂钩,请记录此差距；规范将其定义为 SHOULD 级别的生命周期信号,因此省略它仅属于轻微的合规性缺失。

### 4.3 [minor] 从未通过 session/update 发出 session_info_update

- 位置: `src/services/acp/agent.ts:225-226` (session-list 候选构建)——src/services/acp/ 下没有任何位置发出 session_info_update
- 规范要求: schema.json:2819-2837 SessionInfoUpdate 是一个有效的 SessionUpdate 变体 (`sessionUpdate: 'session_info_update'`),包含可选字段 `title` 和 `updatedAt`。它允许 Agent 通知客户端动态会话标题和最后活动时间戳。
- 当前实现: agent.ts 计算了一个会话标题（`title: sanitizeTitle(candidate.summary ?? '')` 和 `updatedAt: new Date(candidate.lastModified).toISOString()`)——但这仅用于 session/list 响应负载。从不通过 `session/update` 通知向客户端发出 session_info_update,因此当前会话的标题/更新时间永远不会流式传输给客户端。
- 修复建议: 当派生出或更改会话标题时（例如,在第一次助手回复或摘要提取后）,发出:

  ~~~ts
  await this.conn.sessionUpdate({
    sessionId,
    update: { sessionUpdate: 'session_info_update', title: derivedTitle, updatedAt: new Date().toISOString() },
  })
  ~~~

  这通过 v1 稳定版规范中记录的通道,为客户端提供了规范的会话显示名称。

### 4.4 [nit] Bash 工具 _meta 键未命名空间化 ✅ 已修复 (2026-06-19,与 §5.2 合并)

- 位置: `src/services/acp/bridge.ts` `toolUpdateFromToolResult` Bash 分支
- 规范要求: schema.json 将 `_meta` 记录为保留的扩展点（"实现不得对这些键上的值做出假设"）。建议使用反向 DNS / 供应商命名空间的自定义键。
- 修复: 与 §5.2 合并处理 — 完全删除了 `terminal_info` / `terminal_output` / `terminal_exit` 三个非标准 `_meta` 键,以及伪造的 `terminalId`。Bash 工具结果现在统一走 inline `{type:'text'}` content,不再向 `_meta` 注入任何键。命名空间问题随之消失。

---

## 5. tool calls + permissions delegation（维度 5）

### 5.1 [major] terminal 能力检测误用 _meta 而非 clientCapabilities.terminal

- 位置: `src/services/acp/permissions.ts:280-285` (checkTerminalOutput)
- 规范要求: ClientCapabilities schema (schema.json:586-613) defines the standard terminal capability as the boolean field `clientCapabilities.terminal` (line 606-610, default false)。Terminals doc (docs/protocol/terminals.mdx:8-25) states: "Before attempting to use terminal methods, Agents MUST verify that the Client supports this capability by checking ... `clientCapabilities.terminal`"。`_meta` is explicitly reserved and "Implementations MUST NOT make assumptions about values at these keys" (schema.json:1961)。
- 当前实现: checkTerminalOutput 读取 `clientCapabilities._meta.terminal_output === true` 来决定 terminal 支持。从未咨询标准 `clientCapabilities.terminal` 布尔值,因此宣告 `terminal: true`（没有 Claude-Code 特定 `_meta.terminal_output` flag）的合规 ACP 客户端被视为不支持 terminals,而保留的 `_meta` 字段被视为真正的能力。
- 修复建议: 将标准能力作为主要,仅对较旧的 Claude-Code 客户端的遗留 `_meta` flag 进行回退:

  ~~~ts
  function checkTerminalOutput(clientCapabilities?: ClientCapabilities): boolean {
    if (!clientCapabilities) return false
    if (clientCapabilities.terminal === true) return true
    // Legacy Claude-Code clients advertised via _meta before terminal: bool existed
    const meta = (clientCapabilities as unknown as Record<string, unknown>)._meta
    return !!meta && typeof meta === 'object' && (meta as Record<string, unknown>)['terminal_output'] === true
  }
  ~~~

### 5.2 [major] terminal 生命周期未实现,伪造 terminalId 且 _meta 注入非标准键 — 🔶 简化版已修复 (2026-06-19),完整版待办

- 位置: `src/services/acp/bridge.ts` `toolUpdateFromToolResult` Bash 分支 + `toolInfoFromToolUse` Bash 分支
- 规范要求: Terminals doc (docs/protocol/terminals.mdx:27-110) defines the standard terminal lifecycle: the Agent MUST call `terminal/create` to obtain a real `terminalId`, embed it via ToolCallContent `{type:'terminal', terminalId}` (schema.json:3242-3256), and the Client retrieves output via `terminal/output`。ToolCallUpdate._meta is reserved: "Implementations MUST NOT make assumptions about values at these keys" (schema.json:3555)。
- 简化版修复（已落地）: 按文档建议回退到 inline `{type:'text'}` content,删除了伪造的 `terminalId: toolUse.id`（toolInfoFromToolUse + toolUpdateFromToolResult 两处）和三个非标准 `_meta` 键（`terminal_info` / `terminal_output` / `terminal_exit`）。合规客户端不再被误导去查找不存在的 terminal。Bash 输出仍以 ```console 围栏文本形式呈现给客户端。
- 完整版（待办）: 实现标准 terminal 流程,需要 BashTool 接入 PTY 子系统:在工具运行前调用 `conn.request('terminal/create', {sessionId, command, cwd, outputByteLimit})`,嵌入返回的真实 `terminalId` 到 ToolCallContent,通过 terminal 子系统流式输出,完成时 `terminal/release`。此改造涉及 BashTool 执行管线（影响 CLI REPL 路径）,需单独决策是否仅 ACP 路径启用。

### 5.3 [major] cancelled 权限结果被当作普通拒绝

- 位置: `src/services/acp/permissions.ts:136-142` (createAcpCanUseTool cancelled branch) 和 231-237 (handleExitPlanMode cancelled branch)
- 规范要求: RequestPermissionOutcome.cancelled variant (schema.json:2310-2320) is sent by the Client "when a client sends a session/cancel notification to cancel an ongoing prompt turn"。tool-calls.mdx:168-186 and the schema description state the prompt turn was cancelled。When the prompt turn is cancelled the Agent MUST resolve session/prompt with `StopReason::Cancelled` (schema.json:629 "Respond to the original session/prompt request with StopReason::Cancelled")。
- 当前实现: 在 `outcome === 'cancelled'` 时,canUseTool 返回一个通用的 `PermissionDenyDecision`（`behavior:'deny'`、decisionReason mode default / plan）。这作为普通拒绝反馈到工具执行器,因此 turn 继续（或失败与普通的 end_turn / tool-error）而不是用 `cancelled` 中止 turn。agent.cancel() flag 从不响应 cancelled 权限结果设置,因此 prompt 循环不返回 stopReason 'cancelled' 仅因为用户/客户端取消了权限 prompt。
- 修复建议: 将 `cancelled` 结果视为 turn-cancellation 信号。从 canUseTool 抛出一个类型化的 sentinel（或通过闭包传递一个 session-level cancelled flag）并让 forwardSessionUpdates / agent.prompt() 检测它以返回 `{stopReason:'cancelled'}`:

  ~~~ts
  if (response.outcome.outcome === 'cancelled') {
    cancelledRef.cancelled = true   // shared with agent.cancel()
    session.queryEngine.interrupt()
    return { behavior:'deny', message:'Permission request cancelled by client', decisionReason:{type:'mode', mode:'default'}, toolUseID }
  }
  ~~~

  并在 agent.prompt(): `if (session.cancelled) return { stopReason: 'cancelled' }`。

### 5.4 [minor] 从未提供 reject_always 权限选项

- 位置: `src/services/acp/permissions.ts:123-127` (options array)
- 规范要求: PermissionOptionKind enum (schema.json:1992-2016) defines four variants: `allow_once`、`allow_always`、`reject_once`、`reject_always`。tool-calls.mdx:200-208 lists the same four。
- 当前实现: 提供的标准权限选项只有三个: `allow_always`、`allow_once`、`reject_once`。`reject_always`（"Reject this operation and remember the choice"）从不提供,因此用户无法通过协议的预期机制持久化拒绝（客户端依赖此 hint 显示 "remember" 复选框以供拒绝）。
- 修复建议: 添加一个 reject_always 选项,以便四个规范选择可用:

  ~~~ts
  const options: PermissionOption[] = [
    { kind:'allow_always', name:'Always Allow', optionId:'allow_always' },
    { kind:'allow_once',  name:'Allow',        optionId:'allow' },
    { kind:'reject_once', name:'Reject',        optionId:'reject' },
    { kind:'reject_always', name:'Always Reject', optionId:'reject_always' },
  ]
  ~~~

  并在 selected 分支中处理 `optionId === 'reject' || optionId === 'reject_always'`。

### 5.5 [minor] ToolCallLocation.path / Diff.path 未归一化为绝对路径

- 位置: `src/services/acp/bridge.ts:251` (Read locations), 278/300 (Write/Edit locations), 314 (Glob locations), 700 (toolUpdateFromEditToolResponse locations)
- 规范要求: ToolCallLocation.path (schema.json:3517-3519) is "The file path being accessed or modified" (string)。tool-calls.mdx:304-306 and the protocol-wide path rule require absolute paths；Diff.path (schema.json:1178-1181) and the docs example ('/home/user/project/src/main.py') also use absolute paths。The ACP spec states all file paths MUST be absolute。
- 当前实现: Locations 和 diff paths 直接从 tool input（`input.file_path`、`input.path`、`response.filePath`）填充,不归一化为绝对路径。如果模型（或重放）提供相对路径或具有未解析的 `~`/`.` 段的路径,则发出的 ToolCallLocation.path / Diff.path 将是相对的,违反绝对路径要求。cwd 参数可用,但仅用于通过 toDisplayPath 格式化显示路径,不用于绝对化存储路径。
- 修复建议: 在发送前对每个发出的路径针对会话 cwd 进行解析:

  ~~~ts
  import { isAbsolute, resolve } from 'node:path'
  const abs = (p?: string) => p && cwd ? (isAbsolute(p) ? p : resolve(cwd, p)) : p
  // then: locations: filePath ? [{ path: abs(filePath), line: offset ?? 1 }] : []
  // and for diff content: path: abs(filePath)
  ~~~

  应用于 Read/Write/Edit/Glob 和 toolUpdateFromEditToolResponse。

### 5.6 [minor] 无 delete / move ToolKind 映射

- 位置: `src/services/acp/bridge.ts:191-411` (toolInfoFromToolUse)——kind coverage
- 规范要求: ToolKind enum (schema.json:3616-3670): `read`、`edit`、`delete`、`move`、`search`、`execute`、`think`、`fetch`、`switch_mode`、`other`。Tools that remove or rename files SHOULD map to `delete` / `move` so clients can render appropriate UI (schema.json:3629-3638)。
- 当前实现: 大多数工具映射正确（Read→read、Write/Edit→edit、Bash→execute、Grep/Glob→search、WebFetch/WebSearch→fetch、Agent/TodoWrite→think、ExitPlanMode→switch_mode、default→other）。然而,没有为任何 delete 或 move 工具（例如,假设的 rm/mv 工具或 MCP filesystem delete）的映射——这样的工具落入 `other`。这在规范内（'other' 是有效的）但丢失了语义提示。
- 修复建议: 如果/当 delete/move 工具通过 ACP 连接时,添加显式 case,例如 `case 'Remove': case 'Delete': → kind:'delete'`；`case 'Move': case 'Rename': → kind:'move'`。低优先级,直到这样的工具出现。

### 5.7 [nit] ExitPlanMode optionId 与 session-mode ID 碰撞

- 位置: `src/services/acp/permissions.ts:185-209` (handleExitPlanMode options) 和 244-254 (selectedOption check)
- 规范要求: PermissionOption.optionId is a free-form string (schema.json:1988-1990) with no enum constraint, so the custom optionIds `auto`、`acceptEdits`、`default`、`plan`、`bypassPermissions` are schema-valid。然而,与 session-mode ID 碰撞的 optionId 值是应用级歧义,PermissionOptionKind 是唯一标准化的 hint（四变体枚举）。对于实际上切换会话模式的选项（auto/acceptEdits/bypassPermissions）使用 `kind:'allow_always'` 过载了 allow_always 语义。
- 当前实现: ExitPlanMode 发出 4-5 个自定义选项,其中 optionId 等于会话模式 id。kind 字段设置为 allow_always/allow_once/reject_once 作为粗略提示,但 optionId 空间（模式 id）是 Claude-Code 约定,未在协议中文档化。这是允许的可扩展性,但 kind 不忠实地描述 "此选项更改会话模式"。
- 备注: 不是硬性违规,因为 optionId 是 free-form,ExitPlanMode 映射到有效的 ToolKind `switch_mode`。
- 修复建议: 可按原样接受；考虑在这些选项上添加 `_meta` hint（例如 `_meta.claudeCode.changesMode = true`）,以便客户端可以不同地渲染它们,并确保 optionId 值在 agentCapabilities._meta 中文档化为 Claude-Code 特定的。

### 5.8 [nit] rawInput 浅克隆,易受嵌套突变影响

- 位置: `src/services/acp/bridge.ts:1283-1316` (rawInput construction in toAcpNotifications)
- 规范要求: ToolCallUpdate.rawInput (schema.json:3583-3585) is described as "Update the raw input" with no explicit type constraint (free-form)。It is intended to carry the raw tool input parameters (Record<string, unknown>)。
- 当前实现: `const rawInput = toolInput ? { ...toolInput } : {}` 是一个浅克隆；嵌套对象通过引用与实时 tool input 共享。如果在通知序列化之前对嵌套字段进行后续突变,则发出的 rawInput 可以反映执行后状态而不是发送的输入。Schema-valid 但语义脆弱。
- 修复建议: 深克隆（`structuredClone(toolInput)`）或 JSON-round-trip 输入,然后再附加为 rawInput,以保证捕获的值与实际发送给工具的值匹配。

---

## 6. session/set_mode + session/set_model + session/set_config_option + modes/models/configOptions 形状（维度 6）

### 6.1 [major] setSessionMode 改变 mode 后未发 current_mode_update 通知

- 位置: `src/services/acp/agent.ts:396-407` (setSessionMode)
- 规范要求: session-modes.mdx 第 105-121 行: "The Agent can also change its own mode and let the Client know by sending the current_mode_update session notification。" schema.json:1142-1160 CurrentModeUpdate / SessionUpdate variant `current_mode_update` (schema.json:3060-3075)。当 Agent 改变 mode 后 MUST 发送 current_mode_update 通知,使只支持 modes API（不支持 configOptions）的 Client 能感知 mode 切换。
- 当前实现: setSessionMode 调用 applySessionMode（更新内部 session.modes.currentModeId）然后 updateConfigOption('mode', ...) 只发送 config_option_update 通知（agent.ts:862-868）。从不发送 current_mode_update 通知。仅支持 modes 的 Client 将永远收不到 setSessionMode 之后的 mode 变更通知。
- 修复建议: 在 setSessionMode 中,在 applySessionMode 之后追加发送 current_mode_update:

  ~~~diff
   async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
     const session = this.sessions.get(params.sessionId)
     if (!session) throw new Error('Session not found')
     this.applySessionMode(params.sessionId, params.modeId)
  +  await this.conn.sessionUpdate({
  +    sessionId: params.sessionId,
  +    update: { sessionUpdate: 'current_mode_update', currentModeId: params.modeId },
  +  })
     await this.updateConfigOption(params.sessionId, 'mode', params.modeId)
     return {}
   }
  ~~~

  参照 setSessionConfigOption 中 `configId==='mode'` 分支（agent.ts:447-455）已有的 current_mode_update 发送逻辑保持一致。

### 6.2 [minor] NewSession/Load/Resume 响应携带非稳定 v1 models 字段

- 位置: `src/services/acp/agent.ts:675-680` (createSession 返回值) 及 715-720 (getOrCreateSession 返回值)
- 规范要求: schema.json:1916-1955 NewSessionResponse 仅定义 sessionId（必填）、configOptions（可选）、modes（可选）、`_meta`。LoadSessionResponse（schema.json:1668-1697）/ResumeSessionResponse 同样不含 models 字段。v1 稳定 schema 中不存在 SessionModelState/SessionModel/SetSessionModel,model 选择属于 draft/unstable 特性。
- 当前实现: createSession 返回 `{ sessionId, models, modes, configOptions }`,getOrCreateSession 返回值同样包含 models。models 字段在 v1 稳定 schema 中未定义,严格 Client 会忽略它。该字段由 @agentclientprotocol/sdk@0.19.0 的 draft 类型（SessionModelState/ModelInfo）驱动。
- 修复建议: 由于 model 选择为 draft 特性且不在 v1 合规范围,建议: (1) 若仅面向 v1 Client,从 NewSessionResponse/LoadSessionResponse/ResumeSessionResponse 返回值中移除 models 字段,仅保留 sessionId/modes/configOptions；或 (2) 若需保留向后兼容,在响应中保留 models 但明确文档标注为非稳定扩展。最小合规改动:

  ~~~diff
  -return { sessionId, models, modes, configOptions }
  +return { sessionId, modes, configOptions }
  ~~~

### 6.3 [minor] setSessionConfigOption 未校验 value 是否在 options 列表内

- 位置: `src/services/acp/agent.ts:427-469` (setSessionConfigOption)
- 规范要求: session-config-options.mdx 第 189-192 行: "value: The new value to set. Must be one of the values listed in the option's options array。" schema.json:3110-3147 SetSessionConfigOptionRequest 的 value 为 SessionConfigValueId,Agent 应在 option.options 内校验该 value 合法性,非法值应返回错误而非静默接受。
- 当前实现: setSessionConfigOption 通过 id 查找 option（agent.ts:440-443）,但从不校验 params.value 是否存在于 option.options 中。任何字符串（即使不在 options 列表）都会被接受并写入 currentValue,违反 "Must be one of the values listed" 要求。
- 修复建议: 在 option 查找后追加 options 校验:

  ~~~ts
  const option = session.configOptions.find(o => o.id === params.configId)
  if (!option) throw new Error(`Unknown config option: ${params.configId}`)
  const validValues = flattenOptions(option.options).map(o => o.value)
  if (!validValues.includes(params.value)) {
    throw new Error(
      `Invalid value '${params.value}' for config option ${params.configId}; must be one of: ${validValues.join(', ')}`,
    )
  }
  ~~~

  注意 options 可能为 grouped（SessionConfigSelectGroup）或 flat（SessionConfigSelectOption）,需 flatten 处理。

### 6.4 [nit] value 类型守卫冗余

- 位置: `src/services/acp/agent.ts:434-438` (setSessionConfigOption value 类型守卫)
- 规范要求: schema.json:3134-3141 SetSessionConfigOptionRequest.value 引用 SessionConfigValueId（schema.json:2779-2782 type:'string'）。value 始终为字符串。
- 当前实现: 实现包含 `if (typeof params.value !== 'string') throw`,但因 schema 已将 value 固定为 string,此守卫永远为真,属冗余代码。同时该守卫位置在 option 查找之前,错误信息不够精准。
- 修复建议: 由于 SessionConfigValueId 严格为 string,可移除该类型守卫（由 SDK/schema 层保证）；或保留但移至 option.options 校验统一处理,避免分散校验逻辑。

---

## 7. ContentBlock 处理: text/image/audio/resource/resourceLink/thought（维度 7）

### 7.1 [major] promptCapabilities.image 声明但 promptConversion 完全不解析图片

- 位置: `src/services/acp/promptConversion.ts:3` (promptToQueryInput) 与 `src/services/acp/agent.ts:155-158` (initialize)
- 规范要求: schema.json PromptCapabilities.image (line 2126): "Agent supports [ContentBlock::Image]"；content.mdx line 42-55: Image blocks in prompts "Requires the image prompt capability when included in prompts。" 声明了能力就必须能处理对应的 prompt 输入 ContentBlock。
- 当前实现: agent.ts initialize() 声明 `promptCapabilities.image = true`,但 promptToQueryInput() 完全没有 'image' 分支——image block 既不被 base64 解码转成 Claude SDK 的 image content,也不产生任何文本占位,被静默丢弃。客户端按 `image:true` 发送图片 prompt 后内容丢失,无报错。
- 修复建议: 在 promptConversion.ts 增加 image 分支: 将 ACP `{type:'image', data, mimeType}` 转换为 Claude SDK 的 image content block 传给 query（若 query input 仅接受 string,则需扩展 promptToQueryInput 返回 ContentBlock[] 而非 string）。或者若当前 query 层暂不支持多模态输入,应将 `image:false`,使声明与实现一致,并由客户端回退到文本/链接形式。推荐先降级 `image:false`,待多模态 query input 支持后再开启。此问题与维度 1 §1.1、维度 3 §3.1 同根因。

### 7.2 [major] embeddedContext=true 但 BlobResource 被静默丢弃

- 位置: `src/services/acp/promptConversion.ts:19-24` (resource 分支) 与 `src/services/acp/agent.ts:157`
- 规范要求: schema.json PromptCapabilities.embeddedContext (line 2121): 启用时客户端可发送 ContentBlock::Resource；content.mdx line 124-155: EmbeddedResource 支持 TextResource（`{uri,text,mimeType?}`）与 BlobResource（`{uri,blob,mimeType?}`）两种形式。
- 当前实现: 声明 `embeddedContext=true`,但 promptToQueryInput 的 'resource' 分支仅提取 `resource.text`。当客户端发送 BlobResource（如 PDF/二进制文件,字段为 `resource.blob + resource.mimeType + resource.uri`）时,text 为 undefined,内容被完全丢弃,模型只收到空字符串。也未传递 uri/mimeType 上下文。
- 修复建议: 扩展 resource 分支:

  ~~~ts
  } else if (b.type === 'resource') {
    const r = b.resource as Record<string, unknown> | undefined
    if (r && typeof r.text === 'string') {
      parts.push(r.text)
    } else if (r && typeof r.blob === 'string') {
      const mt = typeof r.mimeType === 'string' ? r.mimeType : 'application/octet-stream'
      parts.push(`Embedded resource: ${r.uri ?? '(unknown uri)'} (${mt}, base64 blob)`)
    }
  }
  ~~~

  （理想做法是将 blob 解码并作为 Claude SDK 二进制 content 传入 query；若 query input 不支持则至少以可读占位形式保留上下文,不能静默丢弃。）

### 7.3 [minor] toAcpContentBlock 未处理 resource/resource_link 导致降级为 JSON 文本

- 位置: `src/services/acp/bridge.ts:572` (toAcpContentBlock)
- 规范要求: schema.json ContentBlock.oneOf 包含 ResourceLink (line 1023) 与 EmbeddedResource (line 1039)；content.mdx line 163: ResourceLink 在 prompt 中 ALL agents MUST support；content.mdx line 11: ContentBlock 也用于 session/update 输出与 tool 结果。
- 当前实现: toAcpContentBlock（输出渲染）只显式处理 text/image 及若干 Claude 私有 content 类型；'resource' 和 'resource_link' 类型的 SDK content 落入 default 分支（line 644-648）被序列化为 `{type:'text', text: JSON.stringify(content)}`,产生非规范输出,客户端无法识别为可点击资源。
- 修复建议: 在 toAcpContentBlock switch 中增加 case:

  ~~~ts
  case 'resource_link':
    return { type: 'resource_link', uri: content.uri as string, name: (content.name as string) ?? (content.uri as string), mimeType: content.mimeType as string | undefined }
  case 'resource': {
    const r = content.resource as Record<string, unknown> | undefined
    return { type: 'resource', resource: { uri: r?.uri, mimeType: r?.mimeType, text: r?.text, blob: r?.blob } }
  }
  ~~~

  注意 ImageContent 与 ResourceLink 字段差异: ImageContent 必填 data+mimeType（base64）,uri 为可选；ResourceLink 必填 name+uri,没有 data 字段。

### 7.4 [minor] toAcpContentBlock image 分支 url 处理字段命名澄清

- 位置: `src/services/acp/bridge.ts:596-600` (toAcpContentBlock image 分支 url/非 base64 处理)
- 规范要求: schema.json ImageContent (line 1384-1414): 必填 data（base64）+ mimeType,uri 为可选 string|null。ACP v1 ContentBlock 不支持纯 URL 图片——没有 url 字段,只有可选 uri 引用且仍需 data。
- 当前实现: 当 Claude SDK image content 的 `source.type === 'url'` 时,降级输出文本占位 `[image: <url>]`。这本身符合 ACP（因 ACP 要求 base64 data,URL 图片无法原样转发）。但实现中读取的字段名是 source.url（Claude SDK 私有形态）,与 ACP 无关；同时未考虑 `source.type` 可能既非 base64 也非 url 的情形已用 '[image: file reference]' 覆盖。逻辑可接受,无违规,仅记录字段命名澄清。
- 修复建议: 无需协议层修复。如要增强: 可将 url 图片自行 fetch+base64 编码后转为合规 ImageContent,但需注意安全与性能；当前文本占位降级是合规的最低实现。保持现状即可,此条仅作字段映射文档。

### 7.5 [nit] audio 能力声明与实现一致（合规,仅记录）

- 位置: `src/services/acp/agent.ts:155-158` (initialize promptCapabilities)
- 规范要求: schema.json PromptCapabilities.audio (line 2116, default false)。content.mdx line 74-87: audio block 需 audio capability。
- 当前实现: promptCapabilities 未声明 audio（默认 false）,且 promptConversion.ts 与 bridge.ts toAcpContentBlock 均无 audio 处理。声明与实现一致（均不支持）,符合规范。但输出侧 toAcpContentBlock 也没有 audio 分支——若 Claude 未来输出音频 content 会落入 JSON.stringify。
- 修复建议: 无需修改；当前状态合规。如未来支持音频输入,需同时: (1) agent.ts 声明 `audio:true`；(2) promptConversion.ts 增加 audio→Claude SDK audio block 转换；(3) bridge.ts toAcpContentBlock 增加 `case 'audio'` 输出 `{type:'audio', data, mimeType}`。三者必须同步,避免再次出现 image 那种声明/实现脱节。

### 7.6 [nit] thought / tool_result 映射合规（无需修改）

- 位置: `src/services/acp/promptConversion.ts:8-27` 与 `src/services/acp/bridge.ts:1210-1247` (thought / tool_result)
- 规范要求: schema.json ContentBlock.oneOf (line 966-1053) 仅含 text/image/audio/resource_link/resource 五种——不存在 ThoughtContent；thought 通过 SessionUpdate discriminator `agent_thought_chunk` (schema.json line 2989) 表达,而非 ContentBlock type 或 `role:'thought'`。tool 结果应通过 tool_call_update (schema.json line 3012+) 传递。
- 当前实现: 实现正确,无需修改。

---

## 8. transports / JSON-RPC envelope / acp-link 代理合规（维度 8）

### 8.1 [critical] acp-link WS 使用自有 `{type,payload}` 封装而非 JSON-RPC 2.0

- 位置: `packages/acp-link/src/server.ts:147-156` (send), 800-878 (decodeClientMessage), `packages/acp-link/src/ws-message.ts:52-63`
- 规范要求: transports.mdx L52: "Custom transports MUST ensure they preserve the JSON-RPC message format and lifecycle requirements defined by ACP." overview.mdx L206: "The JSON-RPC envelope fields (jsonrpc, id, method, params, result, and error) follow the JSON-RPC 2.0 specification." transports.mdx L6: "ACP uses JSON-RPC to encode messages."
- 当前实现: acp-link 在 client↔proxy WS 之间使用自有的包装格式 `{ type: string, payload?: unknown }`,而不是 JSON-RPC。ws-message.ts:decodeJsonWsMessage 强制要求每个传入消息包含 'type' 字符串；server.ts:decodeClientMessage 随后切换此 type。客户端发送的任何标准 JSON-RPC 消息（`{ jsonrpc:'2.0', id, method, params }`）均会被拒绝,错误提示为 "Invalid WebSocket message payload" (ws-message.ts:60)。stdout↔stdio 部分使用了正确的 SDK ndJsonStream,但面向客户端的 WS 传输（即实际上暴露给客户端的自定义传输）并非 JSON-RPC。
- 修复建议: 使面向客户端的 WS 传输成为透明的 JSON-RPC 转发器。通过 JSON-RPC method 名而非专有的 `type` 进行路由,并完整透传消息。最小改造方案:

  ~~~ts
  // onMessage: 解析一次 JSON-RPC,然后路由到处理程序
  const msg = JSON.parse(text) as JsonRpcMessage
  if ('method' in msg) {
    // 请求或通知 — 根据 msg.method 进行分发
    const result = await dispatchMethod(msg.method, msg.params)
    if ('id' in msg) send(ws, { jsonrpc:'2.0', id: msg.id, result })
  } else {
    // 响应 — 关联到待处理的出站请求 id
  }
  ~~~

### 8.2 [critical] 代理响应丢弃 JSON-RPC id,无法关联请求

- 位置: `packages/acp-link/src/server.ts:147-156` (send), 412-416 (session_created), 624 (prompt_complete), 473-483 (session_list)
- 规范要求: JSON-RPC 2.0 spec §6: Request 必须包含 `id`；Response 必须包含相同的 `id`、`result` 或 `error`,并带有 `jsonrpc: "2.0"`。overview.mdx L10-13: "请求-响应对期望得到结果或错误"。
- 当前实现: 代理针对客户端请求的响应（例如 `session_created`、`prompt_complete`、`session_list`、`session_loaded`、`model_changed`）使用带有自选 `type` 字符串的 `send(ws, type, payload)`,且从不携带 JSON-RPC `id`。客户端无法将响应与原始请求相关联,因为代理丢弃了请求 id。整个链路中没有任何 `id` 保留。
- 修复建议: 在 ClientState 上保留一个挂起的 id 映射,并在 JSON-RPC 响应中回显请求的 `id`:

  ~~~ts
  send(ws, { jsonrpc:'2.0', id: pendingId, result })
  ~~~

### 8.3 [major] 错误响应使用专有 ProxyError 而非 JSON-RPC 错误对象

- 位置: `packages/acp-link/src/server.ts:358-360, 379, 392, 419-421, 450-453, 486-489, 537-540, 626, 696-699, 1166`；`packages/acp-link/src/types.ts:78-82` (ProxyError)
- 规范要求: overview.mdx L198-201: "所有方法均遵循标准 JSON-RPC 2.0 错误处理……错误包含一个带有 `code` 和 `message` 的 `error` 对象。" JSON-RPC 2.0 预留代码: -32700 解析错误、-32600 无效请求、-32601 方法未找到、-32602 无效参数、-32603 内部错误。
- 当前实现: 所有错误均以专有的 ProxyError `{ type: 'error', message: string, code?: string }` 发出,且没有 JSON-RPC 错误对象,也没有数值类型的 JSON-RPC 代码。例如 server.ts:358 发送 `{ message: 'Failed to connect: ...' }`。`code` 字段是一个自由格式字符串,从未使用过 -326xx 代码。不相关的客户端无法区分解析错误、方法未找到错误和内部错误。
- 修复建议: 发出标准的 JSON-RPC 错误响应,关联到请求 id:

  ~~~ts
  send(ws, { jsonrpc:'2.0', id: reqId, error: { code: -32601, message: 'Not connected to agent' } })
  ~~~

  将已知故障映射到代码: -32700 (decodeJsonWsMessage 解析失败)、-32602 (payloadRecord/optionalStringField 验证)、-32601 (代理不支持该功能或 SDK 调用抛出"不支持")、-32603 (内部异常)。

### 8.4 [major] decodeClientMessage 白名单狭窄,多个 v1 方法无传输路径

- 位置: `packages/acp-link/src/server.ts:800-878` (decodeClientMessage switch), 871 `default: throw new Error('Unknown message type')`
- 规范要求: schema/meta.json 列出了 12 个 agent 方法（authenticate、initialize、logout、session/close、session/set_mode、session/set_config_option 等）和 9 个 client 方法（terminal/*、fs/*）。overview.mdx L52 (自定义传输): 必须保留 JSON-RPC 格式和生命周期。未知方法必须产生 JSON-RPC -32601 method-not-found 错误,而不是断开客户端连接。
- 当前实现: decodeClientMessage 在遇到未知 `type` 时抛出异常,这会导致 onMessage 捕获程序发出通用的 `{ type:'error', message:'Unknown message type: ...' }` (server.ts:1166),但不会发出 -32601 响应。更糟糕的是,代理仅识别固定的方法白名单（connect、disconnect、new_session、prompt、permission_response、cancel、set_session_model、list/load/resume_session、ping）。客户端发起的 `authenticate`、`logout`、`session/close`、`session/set_mode`、`session/set_config_option`、`session/list`（与 list_sessions 不同——注意 meta.json 中的方法名是 `session/list`）以及所有 terminal/* 方法在传输中均无路径。这些方法在协议层被悄悄丢弃。
- 修复建议: 用通用的 JSON-RPC 方法路由器替换专有的 type 切换。对于任何识别出但代理未实现的方法,返回 -32601。至少要透传 `session/set_mode` 和 `session/close`（这些是 v1 的基准/常用方法）。

### 8.5 [major] 未处理 JSON-RPC 标准 `$/cancel_request`

- 位置: `packages/acp-link/src/`（全仓库）；在 acp-link 中 grep `$/cancel_request` 无结果
- 规范要求: JSON-RPC 2.0 spec §6.1: `$/cancel_request` 是用于取消正在进行的请求/通知的标准、传输级取消原语。这与 ACP 特有的 `session/cancel` 通知不同。ACP 透传传输必须将其转发到 stdio 代理进程或进行本地处理。
- 当前实现: 未实现。仅处理专有的 `cancel` 类型 (server.ts:646),它映射到 ACP `session/cancel`。JSON-RPC 级别的 `$/cancel_request` 既未转发给 agent,也未映射到挂起的提示取消。如果客户端发送 `{ "jsonrpc":"2.0", "method":"$/cancel_request", "params": { id: ... } }`,当前解码器会将其拒绝为 "Invalid WebSocket message payload",因为它缺少专有的 `type` 字段。
- 修复建议: 在 JSON-RPC 路由层增加对 `$/cancel_request` 的处理程序: 取消关联的出站提示请求,并转发到底层 SDK 连接的取消路径（或在 agent 上调用 `session/cancel`）。

### 8.6 [major] 代理重构 agentCapabilities 白名单,丢弃扩展能力

- 位置: `packages/acp-link/src/server.ts:321-330`
- 规范要求: ACP 通过 agentCapabilities 按字段协商能力；未来/扩展能力（例如 auth、terminal）必须完整透传给客户端,以便其知道自己可以使用哪些方法。
- 当前实现: server.ts:321-330 通过列出白名单字段（_meta、loadSession、mcpCapabilities、promptCapabilities、sessionCapabilities）来重构 `state.agentCapabilities`。任何 SDK 的 AgentCapabilities 携带但此处硬编码接口 (server.ts:65-79) 中未列出的字段（例如 `auth`、`terminal`、未来的能力）都会被静默丢弃,不会向客户端通告。
- 修复建议: 直接透传原始的 `initResult.agentCapabilities` 对象,而不是重构它:

  ~~~diff
  -state.agentCapabilities = { /* whitelisted fields */ }
  +state.agentCapabilities = agentCaps ?? null
  ~~~

  仅在需要本地 TS 类型时进行收窄——但在传输中发送未收窄的值。

### 8.7 [major] 硬编码 clientInfo/capabilities,丢弃客户端真实信息

- 位置: `packages/acp-link/src/server.ts:313-319`
- 规范要求: overview.mdx L20-24: 客户端 → agent: `initialize` 以协商连接。InitializeParams 携带客户端真实的 `clientInfo`（`{name, version}`）,以便 agent 进行日志记录/遥测。clientCapabilities 同样必须反映真实的客户端能力。
- 当前实现: 代理硬编码 `clientInfo: { name: 'zed', version: '1.0.0' }` 和 `clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } }`,忽略客户端实际发送的任何 clientInfo/capabilities。非 Zed 客户端（Web UI、RCS 中继、自定义客户端）被错误地呈现给 agent 为 'zed 1.0.0',并可能通告了它并不支持的 fs 能力。
- 修复建议: 接受来自客户端 initialize 消息的 clientInfo 和 clientCapabilities 并进行转发。仅使用 'zed'/{fs:true} 作为代理内部未提供任何信息时的回退。

### 8.8 [major] types.ts ClientCapabilities/ServerCapabilities 形状陈旧

- 位置: `packages/acp-link/src/types.ts:96-113` (ClientCapabilities, ServerCapabilities)
- 规范要求: schema.json InitializeParams.clientCapabilities 和 InitializeResult.agentCapabilities 使用特定形状（例如带有嵌套 `fs.readTextFile/writeTextFile` 的 clientCapabilities；agentCapabilities = loadSession、mcpCapabilities、promptCapabilities、sessionCapabilities）。overview.mdx L206: 协议对象键使用 camelCase。
- 当前实现: types.ts:96-113 定义了过时的形状——`ClientCapabilities { streaming?, toolApproval? }` 和 `ServerCapabilities { streaming?, tools? }`——这与实际的 ACP v1 schema 不匹配。这些类型虽然已声明但从未通过 JSON-RPC 路径实际使用；它们具有误导性,并暗示代理正在协商 ACP 中不存在的 streaming/tools 能力。
- 修复建议: 完全移除过时的 `ClientCapabilities`/`ServerCapabilities` 类型（它们在任何实时代码路径中均未使用——server.ts 使用其内联的 `AgentCapabilities`）,或用 SDK 定义的结构替换它们。

### 8.9 [minor] agentInfo 类型收窄过紧,丢失扩展字段

- 位置: `packages/acp-link/src/types.ts:63-71` (ProxyStatus.agentInfo), `packages/acp-link/src/server.ts:346`
- 规范要求: ACP agentInfo（InitializeResult.agentInfo）至少为 `{ name, version }`,但根据 extensibility.mdx 可以携带额外的 _meta/扩展字段；自定义传输应保留它。
- 当前实现: ProxyStatus 类型将 `agentInfo` 收窄为 `{ name?: string; version?: string }` (types.ts:66-69)。实际发送的对象 (server.ts:346) 是原始的 `initResult.agentInfo`,所以运行时没问题,但声明的类型会丢弃 TS 认为客户端收到的任何附加字段,且阅读此类型的客户端无法依赖扩展的 agentInfo。types.ts:87-108 中类似地过时的 InitializeParams/InitializeResult 与 SDK 的实际形状不匹配。
- 修复建议: 加宽类型:

  ~~~ts
  agentInfo?: { name: string; version: string; [k: string]: unknown }
  ~~~

  或者通过 SDK 重新导出真实的 InitializeResult 类型。

### 8.10 [minor] session/update 通知方向正确（合规,记录）

- 位置: `packages/acp-link/src/server.ts:190-192` (createClient.sessionUpdate)
- 规范要求: overview.mdx L180-189: `session/update` 是一个 agent→client 通知（无响应）。
- 当前实现: 正确: sessionUpdate 流向 agent→client（通过 SDK ClientSideConnection 回调,然后 `send(ws, 'session_update', params)`）。代理在 client→agent 方向上不接受 `session_update`（decodeClientMessage 没有该情况）。此处未发现问题——为完整性而列出。
- 修复建议: 无需操作；行为正确。仅将其记录为已验证项。

### 8.11 [minor] 应用层 ping/pong 与传输级 WS 心跳冗余

- 位置: `packages/acp-link/src/server.ts:915-917` (ping → pong)
- 规范要求: WS-level ping/pong 在 RFC 6455 §5.5.2 中是传输级控制帧（二进制操作码 0x9/0xA）,而不是应用层消息。将它们与应用层消息混合是非标准的。ACP 本身没有应用层 ping 方法。
- 当前实现: 代理实现了应用层的 `{ type: 'ping' }` / `{ type: 'pong' }` (server.ts:915-917),与传输级的 WS 心跳 (server.ts:1199-1216 通过 `ws.raw.ping()`) 并存。这是冗余的,且容易混淆——如果客户端将应用层 ping 发送为 JSON-RPC `{ method: 'ping' }`,它将无法与传输层帧区分,并会被拒绝。
- 修复建议: 移除应用层的 ping/pong 情况；仅依赖传输级的 WS ping/pong 心跳 (server.ts:1199)。或者,如果需要,文档说明自定义 ping 并通过相同的 `{ type, payload }` 约定路由它。

### 8.12 [minor] RCS 中继路径同样施加 `{type,payload}` 封装

- 位置: `packages/acp-link/src/rcs-upstream.ts:117-149` (connect: REST + identify)
- 规范要求: transports.mdx L52: 自定义传输必须保留 JSON-RPC 消息格式。ACP 规范未定义 RCS "环境/桥接" REST 注册或 WS `identify`/`identified`/`registered`/`keep_alive` 消息类型——这些是 RCS 特定的（超出 ACP v1 范围）。一旦注册,中继必须转发未更改的 JSON-RPC。
- 当前实现: 两步流程（REST POST /v1/environments/bridge,然后 WS `identify`→`identified` 握手）是 RCS 专有的,对于 RCS 传输是可以接受的。但是,rcs-upstream.ts:151-221 中的中继消息处理程序通过相同的 `decodeJsonWsMessage`（要求 `{ type }` 形状）解码所有传入的服务器消息,并仅将非控制类型转发给 messageHandler (L213-219)。这意味着 RCS 和 agent 之间的中继也施加了 `{ type, payload }` 而非 JSON-RPC,这与主 WS 代理有相同的封装问题。
- 修复建议: 对于从 RCS 到本地 agent 的中继路径,解码为 JSON-RPC 并路由方法名。控制消息（identify/identified/registered/keep_alive）属于 RCS 特有的带外,应通过单独的传输层接口处理,而不是与 ACP 有效负载复用。

### 8.13 [minor] 协议版本未在 status 消息中转发给客户端

- 位置: `packages/acp-link/src/server.ts:314` (acp.PROTOCOL_VERSION), 333-342 (logs protocolVersion)
- 规范要求: ACP 稳定 protocolVersion 在 schema/meta.json 中为 `1`（整数）。InitializeResponse.protocolVersion 必须透传,以便客户端和 agent 就协商的版本达成一致。
- 当前实现: 代理使用 SDK 常量 `acp.PROTOCOL_VERSION` 发送 initialize,并记录返回的 `initResult.protocolVersion` (server.ts:335),但从未在 `status`/`session_created` 消息中将 `protocolVersion` 转发给客户端客户端（send() 调用省略了它）。下游 WS 客户端无法观察协商的协议版本。未发现版本损坏（SDK 管理往返）,但客户端缺乏可见性。
- 修复建议: 在连接后发送的 `status` 消息中包含 `protocolVersion: initResult.protocolVersion` (server.ts:344-348)。

### 8.14 [nit] JsonRpc 类型未使用（死代码）

- 位置: `packages/acp-link/src/types.ts:34-46` (isRequest/isResponse/isNotification)
- 规范要求: JSON-RPC 2.0 spec §4.1/§4.2: Request = 带有 method+id 的对象；Notification = 带有 method 但无 id 的对象；Response = 带有 id 且无 method 的对象,以及 result 或 error。
- 当前实现: 辅助函数看起来正确,但这些 JsonRpc 类型在 acp-link 运行时中的任何地方都未使用（代理绕过了它们而使用 `{type,payload}`）。死代码表明存在意图与实现之间的脱节。
- 修复建议: 要么将 JSON-RPC 路由基于这些类型（首选——修复 §8.1 finding）,要么移除死类型以避免误导未来的维护者。

---

## 附录 A: SDK 方法命名对照

| SDK 方法 | 当前命名 | stable? | 修复动作 |
|---|---|---|---|
| initialize | initialize | stable | 保留（但需修 authMethods 缺失） |
| authenticate | authenticate | stable | 保留（建议显式返回 authMethods:[]） |
| logout | 未实现 | stable | 保留不实现（也未宣告 auth.logout 能力） |
| newSession | newSession | stable | 保留 |
| loadSession | loadSession | stable | 保留（需补 cwd 校验） |
| unstable_resumeSession | unstable_resumeSession | stable (resumed) | 建议在 SDK 升级后改名为 `resumeSession`,同时去除重放历史 |
| unstable_forkSession | unstable_forkSession | UNSTABLE | 保留 unstable 命名；但应从 sessionCapabilities.fork 迁移到 _meta.claudeCode.forkSession |
| listSessions | listSessions | stable | 保留（需实现 cursor 分页） |
| unstable_closeSession | unstable_closeSession | UNSTABLE | 保留 |
| prompt | prompt | stable | 保留（需修 usage 字段、refusal 映射） |
| cancel | cancel (notification) | stable | 保留 |
| setSessionMode | setSessionMode | stable | 保留（需补 current_mode_update 通知） |
| setSessionConfigOption | setSessionConfigOption | stable | 保留（需补 value 校验） |
| unstable_setSessionModel | unstable_setSessionModel | UNSTABLE | 保留 |
| session/update | sessionUpdate (notification) | stable | 保留（usage_update 为 UNSTABLE 但为 interop 保留,见 §4.1） |

## 附录 A.2: UNSTABLE RFD 实现记录（2026-06-19）

下列 UNSTABLE RFD 不属于严格 v1 合规范围,但为提升 interop 与客户端 UX 已主动实现。所有字段均已存在于 SDK 0.19.0 bundled schema 的 unstable 区段,主要 ACP 客户端（Zed / Cursor / RCS Web UI）均实现。

### A.2.1 session/delete（rfds/session-delete.mdx）✅ 已实现

- **能力广告**: `sessionCapabilities.delete: {}`（通过类型增强写入,因 SDK 0.19.0 的 SessionCapabilities 类型早于该 RFD）。
- **方法路由**: SDK 0.19.0 的方法分发器 `default` 分支调用 `agent.extMethod(method, params)`,因此 `session/delete` 通过 extMethod 钩子路由到 `unstable_deleteSession`。
- **语义**: 硬删除（unlink `~/.claude/projects/<sanitized-path>/<sessionId>.jsonl`）。spec 允许 soft/hard delete,选 hard delete 简化实现。
- **幂等性**: 删不存在的 session 也成功（ENOENT 视为成功）。
- **未知方法**: extMethod 对未识别方法抛 `RequestError.methodNotFound(method)`（JSON-RPC -32601）。
- **测试覆盖**: 6 个测试用例（能力广播 / extMethod 路由 / 幂等 / 内存清理 / 缺 sessionId 拒绝 / 未知方法拒绝）。

### A.2.2 message-id（rfds/message-id.mdx）✅ 已实现

- **覆盖范围**: `agent_message_chunk` / `user_message_chunk` / `agent_thought_chunk` 三个 chunk update 携带 `messageId`（UUID）。同消息的所有 chunks 共享 ID,不同消息 ID 不同。
- **不覆盖**: `tool_call` / `tool_call_update` / `plan` 不携带 messageId（spec 仅规定 chunk 类型）。
- **生成策略**:
  - **Assistant 消息**: 在 `forwardSessionUpdates` 中维护 `currentAgentMessageId: string | null`,在 `stream_event` 或 `assistant` SDK 消息（`parent_tool_use_id === null`）首次出现时 lazy 生成 UUID；assistant 消息处理完后 reset 为 null,下一条触发新 UUID。所有 chunks（包括 streaming text/thinking 和最终 assistant message 中的 text/image）共享同一个 ID。
  - **Subagent 消息**（`parent_tool_use_id !== null`）: 不追踪 messageId,因 spec 中嵌套 tool 消息不属于顶层 chunk 流。
  - **历史重放**（`replayHistoryMessages`）: 每条 replayed user/assistant 消息独立生成 UUID（JSONL 不保留原始 ACP messageId）。
- **格式**: `crypto.randomUUID()`（不用 Anthropic 的 `message.id` —— 它是 `msg_xxx` 格式,不符合 spec 要求的 UUID）。
- **PromptRequest.messageId → PromptResponse.userMessageId**: 仅当客户端传入 `params.messageId` 时回显（spec 用词为 MAY 自行生成 → 取保守做法,不自行生成）。
- **测试覆盖**: 7 个测试用例（assistant chunk / 多消息不同 ID / streaming 共享 ID / tool_call 不带 ID / subagent 不带 ID / replay per-message UUID / replay 字符串内容带 ID）+ 2 个 prompt 回显测试（echo / omit）。

## 附录 B: 不修复项及理由

以下 finding 出于技术权衡或非合规范围,暂不修复:

| Finding | 理由 |
|---|---|
| §1.2 sessionCapabilities.fork 仅作"迁移到 _meta"建议,未标记 P0 阻断 | fork 为 UNSTABLE,严格 v1 合规范围外；当前 schema 未设 `additionalProperties:false`,不会导致硬失败。优先用 _meta.claudeCode.forkSession 重构,不阻断。 |
| §2.5 listSessions 空字符串 title | SessionInfo.title schema 允许 null；空字符串技术有效。基于磁盘的候选者很少幸存于空摘要。属表面问题。 |
| §2.6 NewSessionResponse 不含 cwd | 规范本身不要求返回 cwd；记录是为了纠正审计检查清单的错误前提。 |
| §3.5 prompt _meta 透传（W3C traceparent） | extensibility.mdx 用词为 SHOULD,非 MUST。OpenTelemetry interop 非当前部署场景的必需功能。列为 P2。 |
| §3.7 空 prompt 提前返回 end_turn | 行为可接受（虽语义不严谨）；若改为抛出 -32602 需协调 Client 错误处理。列为 P2。 |
| §3.8 usage 缺 thoughtTokens | 仅在保留 unstable usage 字段时才有意义；若按 §3.2 整体移除 usage,此项自动消失。 |
| §4.4 Bash _meta 键未命名空间化 | 非规范违规（_meta 允许任意附加键）；仅命名风格不一致。 |
| §5.4 reject_always 未提供 | PermissionOptionKind 四变体为推荐而非 MUST；REPL 现有交互流不支持持久的拒绝记忆。列为 P2。 |
| §5.7 ExitPlanMode optionId 与 session-mode 碰撞 | optionId 是 free-form 字符串,使用模式 id 作为值是合法扩展；ExitPlanMode 映射为 switch_mode,语义可辨。 |
| §5.8 rawInput 浅克隆 | Schema-valid,仅在嵌套对象被后续突变时才有问题；Claude Code 工具 input 通常不可变。低风险。 |
| §6.2 响应中携带 models 字段 | 为 SDK draft 类型驱动,严格 v1 Client 会忽略；若客户端使用 SDK 同版本,则 models 是有用的扩展字段。优先移除但非阻断。 |
| §6.4 value 类型守卫冗余 | 不影响合规性,仅代码质量问题。 |
| §7.4 image url 占位字段命名 | 实现合规,仅为字段映射文档。 |
| §7.5 audio 不支持 | 声明与实现均不支持,完全合规。 |
| §7.6 thought / tool_result 映射 | 实现正确,无需修改。 |
| §8.10 session/update 通知方向 | 行为正确,为完整性记录。 |
| §8.11 应用层 ping/pong | 冗余但无害；仅在客户端用 JSON-RPC `ping` 时混淆。低优先级。 |
| §8.14 JsonRpc 死类型 | 不影响运行时；仅在 §8.1 修复时一并清理。 |

## 附录 C: 修复路径建议

### P0 阻断修复（合规性硬阻塞）

1. **acp-link JSON-RPC 传输改造**（§8.1、§8.2、§8.3、§8.4、§8.5）——成本高,但属协议层根本缺陷。需要将 WS 解码/编码从 `{type,payload}` 改为 JSON-RPC 2.0,保留请求 id,使用标准错误代码,实现通用方法路由。建议分两阶段: 第一阶段透传所有未识别方法（修复 §8.4）+ 标准 id 关联（§8.2）+ 标准错误（§8.3）；第二阶段迁移到完全 JSON-RPC（§8.1）+ 实现 `$/cancel_request`（§8.5）。

2. **image 能力降级为 false**（§1.1、§3.1、§7.1）——低成本,只需一行改动,立即消除协议谎言。多模态 query input 完成后再恢复 `image:true`。

3. **session/resume 去除重放**（§2.1）——中成本,需要将 resume 与 load 路径分离,引入 `replay` 标志。

4. **~~删除 usage_update 通知~~（§4.1）** —— ⚠️ **已撤销**: 删除后客户端显示 0/0,严重破坏 interop。现保留 `usage_update` 发送(见 §4.1 决策回滚说明)。

### P1 重要修复（非阻断但影响协议契约）

1. **PromptResponse.usage 字段移至 _meta**（§3.2）
2. **refusal stop_reason 映射**（§3.3）
3. **terminal 能力标准生命周期**（§5.1、§5.2）——成本高,涉及 terminal/create/release RPC 调用
4. **cancelled 权限结果传播**（§5.3）
5. **setSessionMode 发送 current_mode_update**（§6.1）
6. **session/load 跨项目 cwd 校验**（§2.2）
7. **unstable_forkSession 实现真正分叉**（§2.3）
8. **BlobResource 处理**（§7.2）
9. **agentCapabilities/clientInfo 透传**（§8.6、§8.7）
10. **ClientCapabilities/ServerCapabilities 类型陈旧**（§8.8）
