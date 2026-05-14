/** 返回进程启动时的原始工作目录（不受中途切换工作区影响）；与宿主 `getOriginalCwd` 一致。 */
export type getOriginalCwd =
  typeof import('src/bootstrap/state.js').getOriginalCwd
