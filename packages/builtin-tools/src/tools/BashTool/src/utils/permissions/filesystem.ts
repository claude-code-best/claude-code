/** 判断路径是否落在当前工具允许的合并工作目录内；与宿主 `pathInAllowedWorkingPath` 一致。 */
export type pathInAllowedWorkingPath =
  typeof import('src/utils/permissions/filesystem.js').pathInAllowedWorkingPath
