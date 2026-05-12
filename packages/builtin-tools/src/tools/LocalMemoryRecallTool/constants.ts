export const LOCAL_MEMORY_RECALL_TOOL_NAME = 'LocalMemoryRecall'

/** Per-turn budget for full fetch payloads accumulated across multiple calls. */
export const PER_TURN_FETCH_BUDGET_BYTES = 100 * 1024
/** Single-entry preview cap (preview_only mode default = true). */
export const PREVIEW_CAP_BYTES = 2 * 1024
/** Single-entry full fetch cap. */
export const FETCH_CAP_BYTES = 50 * 1024
/** list_stores aggregate cap (for ~256 store names). */
export const LIST_STORES_CAP_BYTES = 4 * 1024
/** list_entries cap per store. */
export const LIST_ENTRIES_CAP_BYTES = 8 * 1024
