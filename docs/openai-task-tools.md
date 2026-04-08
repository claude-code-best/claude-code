# OpenAI兼容模型中task工具使用指南

## 问题描述

当使用OpenAI兼容模型（如DeepSeek、Ollama、vLLM等）时，调用task工具（TaskGet、TaskCreate、TaskUpdate、TaskList）可能会出现以下错误：

```
Error: InputValidationError: TaskGet failed due to the following issues:
   The required parameter `taskId` is missing
   An unexpected parameter `task_id` was provided
   
   This tool's schema was not sent to the API — it was not in the discovered-tool set derived from message history. Without the schema in your prompt, typed parameters (arrays, numbers, booleans) get emitted as strings and the client-side parser rejects them. Load the tool first: call ToolSearch with query "select:TaskGet", then retry this call.
```

## 问题原因

### 1. 延迟加载工具（Deferred Tools）
task工具都是延迟加载的（`shouldDefer: true`），这意味着：
- 工具的模式（schema）不会在初始API调用中发送
- 需要先通过`ToolSearch`工具发现
- 只有在被发现后，工具模式才会被发送给API

### 2. 参数名转换问题
- task工具使用驼峰命名：`taskId`
- OpenAI兼容模型可能输出蛇形命名：`task_id`
- 当工具模式没有被发送时，模型会猜测参数名，可能导致不匹配

## 解决方案

### 方案1：先使用ToolSearch（推荐）
在使用task工具之前，先调用`ToolSearch`工具：

```javascript
// 第一步：发现task工具
ToolSearch("select:TaskGet,TaskCreate,TaskUpdate,TaskList")

// 第二步：正常使用task工具
TaskCreate({ subject: "任务标题", description: "任务描述" })
TaskGet({ taskId: "1" })
TaskUpdate({ taskId: "1", status: "completed" })
TaskList()
```

### 方案2：批量发现所有task工具
```javascript
// 一次性发现所有task工具
ToolSearch("select:TaskGet,TaskCreate,TaskUpdate,TaskList")

// 然后可以任意使用task工具
const task = await TaskCreate({ subject: "新任务", description: "任务描述" })
console.log(`创建的任务ID: ${task.id}`)

const taskList = await TaskList()
console.log(`当前有 ${taskList.tasks.length} 个任务`)
```

### 方案3：单独发现特定工具
```javascript
// 只发现需要的工具
ToolSearch("select:TaskGet")

// 然后使用该工具
TaskGet({ taskId: "1" })
```

## 参数名注意事项

在使用OpenAI兼容模型时，请注意参数名格式：

### ✅ 正确（驼峰命名）
```javascript
TaskGet({ taskId: "1" })
TaskCreate({ subject: "标题", description: "描述" })
TaskUpdate({ taskId: "1", status: "completed" })
```

### ❌ 错误（蛇形命名）
```javascript
TaskGet({ task_id: "1" })  // 错误：应该使用taskId
TaskCreate({ subject: "标题", description: "描述" })  // 正确
TaskUpdate({ task_id: "1", status: "completed" })  // 错误：应该使用taskId
```

## 常见问题解答

### Q1: 为什么需要先使用ToolSearch？
A: task工具是延迟加载的，它们的模式只有在被`ToolSearch`工具发现后才会发送给API。没有工具模式，模型无法知道正确的参数名和类型。

### Q2: 每次会话都需要使用ToolSearch吗？
A: 是的，每次新的会话都需要先使用ToolSearch发现工具。工具发现状态不会在会话之间保留。

### Q3: 使用Anthropic官方模型也需要这样吗？
A: 通常不需要。Anthropic官方模型对延迟加载工具的处理更智能，但为了兼容性，建议在使用task工具前都先使用ToolSearch。

### Q4: 可以一次性发现所有工具吗？
A: 可以，使用`ToolSearch("select:TaskGet,TaskCreate,TaskUpdate,TaskList")`可以一次性发现所有task工具。

### Q5: 如果忘记使用ToolSearch会怎样？
A: 会收到参数验证错误，提示需要先使用ToolSearch。按照错误信息的指导操作即可。

## 最佳实践

1. **会话开始时发现工具**：在开始使用task工具前，先调用ToolSearch
2. **批量发现**：一次性发现所有需要的task工具
3. **检查参数名**：确保使用正确的驼峰命名参数
4. **查看错误信息**：如果遇到错误，仔细阅读错误信息中的指导

## 示例工作流

```javascript
// 1. 开始新会话
// 2. 发现task工具
ToolSearch("select:TaskGet,TaskCreate,TaskUpdate,TaskList")

// 3. 创建任务
const newTask = await TaskCreate({
  subject: "修复OpenAI兼容性问题",
  description: "解决task工具在OpenAI兼容模型下的参数名问题"
})

// 4. 获取任务详情
const taskDetails = await TaskGet({ taskId: newTask.id })

// 5. 更新任务状态
await TaskUpdate({ 
  taskId: newTask.id, 
  status: "in_progress",
  activeForm: "修复OpenAI兼容性问题"
})

// 6. 查看所有任务
const allTasks = await TaskList()
console.log(`当前有 ${allTasks.tasks.length} 个任务`)

// 7. 完成任务
await TaskUpdate({ 
  taskId: newTask.id, 
  status: "completed"
})
```

## 故障排除

### 错误：参数名不匹配
**症状**：`taskId`参数缺失，发现`task_id`参数
**解决**：确保使用驼峰命名的`taskId`，而不是蛇形命名的`task_id`

### 错误：工具模式未发送
**症状**：`This tool's schema was not sent to the API`
**解决**：先使用`ToolSearch("select:工具名")`发现工具

### 错误：工具不可用
**症状**：工具调用失败，没有具体错误信息
**解决**：检查工具是否启用（通过`isTodoV2Enabled()`），确保环境变量设置正确

## 相关配置

### 环境变量
```bash
# 启用OpenAI兼容模式
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=your-api-key
export OPENAI_BASE_URL=https://api.deepseek.com

# 配置模型映射
export OPENAI_DEFAULT_SONNET_MODEL=deepseek-chat
export OPENAI_DEFAULT_OPUS_MODEL=deepseek-chat
export OPENAI_DEFAULT_HAIKU_MODEL=deepseek-chat
```

### 设置文件
通过`/login`命令配置OpenAI兼容模式后，设置会保存在`~/.claude/settings.json`：
```json
{
  "modelType": "openai",
  "openai": {
    "baseURL": "https://api.deepseek.com",
    "apiKey": "your-api-key",
    "models": {
      "haiku": "deepseek-chat",
      "sonnet": "deepseek-chat",
      "opus": "deepseek-chat"
    }
  }
}
```

## 总结

在使用OpenAI兼容模型时，task工具需要先通过`ToolSearch`发现才能正常使用。遵循"先发现，后使用"的原则，并注意参数名的正确格式（驼峰命名），可以确保task工具在OpenAI兼容模型下正常工作。