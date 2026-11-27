import { registerBundledSkill } from '../bundledSkills.js'

const BLENDER_MODELING_PROMPT = `# Blender 3D 建模

## 何时使用

当用户要在运行中的 Blender 场景里查看对象、调整选择、按自然语言精修几何/材质/
灯光，或导出场景时使用。桌面应用里的“3D 建模”标签页负责视窗和对象树；这里描述
的是模型侧的调用方式。

## 前提

- 引擎工具默认注册；只有显式设置 \`AUTOAGENT_BLENDER=0\` 时才不可用。
  工具不可用时不要假装已经连上 Blender。
- Blender 侧必须启用 OpenCC Blender Bridge 插件并点击 Connect to OpenCC，默认监听
  \`127.0.0.1:9876\`，协议版本 11。桌面会先握手并检查版本。
- 只根据工具真实返回的结果说“完成了”，不要把“脚本已暂存”说成“已经执行”。

## 先读状态，再动手

1. 用 \`blender\` 工具的 status 动作确认连接、插件版本、协议版本和 Blender
   版本。报错或未连接时如实告诉用户，并提示启动插件。
2. 用 scene 动作读取场景名、对象列表和集合摘要；不要猜对象名。
3. 用 selection 动作读取当前选择、活动对象和模式。对象以 **name** 为唯一标识。

## 没有选中对象时（整个场景创作）

不要要求用户先选择。CLI 直接调用 \`blender\` 的 \`begin_edit\`；桌面 mod 的 \`ai\`
会创建 \`scope: "scene"\` 锁。scene 锁下脚本可以在整个场景中新建/调整内容，仍然
禁止 import、文件系统/网络等危险操作，并且不要删除无关对象。应用 scene 锁时宿主
不会重新选中对象，而是直接执行暂存脚本。

## 选择对象

用 \`blender\` 工具的 select 动作，参数是对象名数组（可选子元素模式）。它会先
取消全选，再选中给定对象。只选择完成任务所需的最少对象；选择范围就是后续
AI 精修的锁定边界。

## 精修锁定流程

模型发明的修改必须走 staged 流程，不能直接 \`exec\`：

1. UI 调用 mod 的 \`sync\` 记录选择，然后用户点击 AI 精修；mod 生成 \`lockId\`
   并返回一段 composer prompt（其中包含锁定的对象名、选择 JSON 和 rules）。
2. 按那段 prompt 的要求，调用 \`edit_blender_selection\`：
   - \`lockId\` 必须与 prompt 给出的完全一致；
   - 只修改/影响 prompt 列出的对象，其他对象一律不动；
   - \`script\` 是一段普通 bpy Python，不要 Markdown 代码块；
   - **禁止 import**，禁止 \`open()\`、\`subprocess\`、\`os.*\`、\`sys.*\`、\`eval\`、
     \`exec\`，禁止文件系统和网络访问；
   - \`summary\` 用一句话说明改动。
3. 工具只做校验和暂存（状态变为 \`staged\`），**不执行**。告诉用户去面板预览
   并点击“应用”或“取消”。
4. 用户点“应用”后，桌面会先重新选中锁定的对象，再原样执行这段已确认的脚本；
   你**不要**自己用 \`exec\` 执行或重写它。
5. 工具因脚本不合规（越界、import、格式错误）或锁号写错而拒绝时，锁仍然有效：
   按错误信息修正后，用同一个 \`lockId\` 再调用一次。锁过期或用户取消后锁会被
   清回 idle，这时让用户重新发起 AI 精修。
6. 脚本里用对象名字面量定位对象（例如 \`bpy.data.objects["Cube"]\`），不要依赖
   当前选择或活动对象。

## CLI 直接闭环（没有桌面 mod）

纯 CLI 会话没有桌面 mod 写锁时，用 \`blender\` 工具自己完成闭环：

1. \`select\` 选中要编辑的对象；
2. \`begin_edit\`：按当前选择建锁，返回 \`lockId\`、对象名和 prompt；
3. \`edit_blender_selection\`：用该 \`lockId\` 暂存脚本；
4. \`apply_staged\`：执行暂存的脚本并清锁；或 \`cancel_edit\` 放弃。

不要用 \`exec\` 代替 \`apply_staged\`，也不要在没有锁的情况下直接改对象。

**10 分钟规则**：锁从创建起超过 10 分钟即失效。失效后不要沿用旧 \`lockId\`；
让用户重新选择并发起新的 AI 精修。

## 截图与导出

- screenshot 动作用来让用户/模型确认当前视窗；返回的是图片引用，不要编造画面
  内容。
- export 动作把场景或当前选择导出为常用格式，路径由调用方给出（桌面面板的导出
  落在应用数据目录的 artifacts/blender 下并返回路径）。导出前先确认格式和是否
  selection-only。
- 导出和截图都是读取操作，不需要锁。

## 安全边界

- 只操作选中的对象；不要用全局遍历或按索引改“看起来像”的对象。
- 不做破坏性操作（删除、清空场景、覆盖用户文件），除非用户明确要求并确认。
- \`exec\` 是逃生通道：只用于用户明确同意的检查或操作。不要用它绕过
  \`edit_blender_selection\` 的锁定，也不要用它执行暂存的脚本。
- 一次 AI 精修最多锁定 200 个对象（Blender 插件只列出前 200 个名字），单个名称
  256 字符；完整 prompt 上限 512KB，超过时应减少选择或缩短要求，而不是截断 JSON。
`

export function registerBlenderModelingSkill(): void {
  registerBundledSkill({
    name: 'blender-modeling',
    description:
      '在运行中的 Blender 场景里查看状态/场景/选择、选择对象、按“选定范围 → 锁定 → 暂存 bpy 脚本 → 应用/取消”的流程做 AI 精修，并截图或导出；默认开启，AUTOAGENT_BLENDER=0 可关闭。',
    allowedTools: ['blender', 'edit_blender_selection'],
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = BLENDER_MODELING_PROMPT
      const supplied = args.trim()
      if (supplied) {
        prompt += `\n## 当前请求\n\n${supplied}\n\n按上面的流程处理这个请求。\n`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
