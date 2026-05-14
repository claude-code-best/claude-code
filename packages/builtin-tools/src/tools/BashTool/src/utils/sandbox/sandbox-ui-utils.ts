/** 从展示文本中剥离沙箱违规相关的标记标签，避免 UI 噪音；与宿主 `removeSandboxViolationTags` 一致。 */
export type removeSandboxViolationTags =
  typeof import('src/utils/sandbox/sandbox-ui-utils.js').removeSandboxViolationTags
