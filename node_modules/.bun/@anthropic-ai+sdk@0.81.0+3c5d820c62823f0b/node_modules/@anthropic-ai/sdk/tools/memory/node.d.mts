export { betaMemoryTool } from "../../helpers/beta/memory.mjs";
export type { MemoryToolHandlers } from "../../helpers/beta/memory.mjs";
import type { MemoryToolHandlers } from "../../helpers/beta/memory.mjs";
import { BetaMemoryTool20250818CreateCommand, BetaMemoryTool20250818DeleteCommand, BetaMemoryTool20250818InsertCommand, BetaMemoryTool20250818RenameCommand, BetaMemoryTool20250818StrReplaceCommand, BetaMemoryTool20250818ViewCommand } from "../../resources/beta.mjs";
export declare class BetaLocalFilesystemMemoryTool implements MemoryToolHandlers {
    private basePath;
    private memoryRoot;
    constructor(basePath?: string);
    static init(basePath?: string): Promise<BetaLocalFilesystemMemoryTool>;
    private validatePath;
    view(command: BetaMemoryTool20250818ViewCommand): Promise<string>;
    create(command: BetaMemoryTool20250818CreateCommand): Promise<string>;
    str_replace(command: BetaMemoryTool20250818StrReplaceCommand): Promise<string>;
    insert(command: BetaMemoryTool20250818InsertCommand): Promise<string>;
    delete(command: BetaMemoryTool20250818DeleteCommand): Promise<string>;
    rename(command: BetaMemoryTool20250818RenameCommand): Promise<string>;
}
//# sourceMappingURL=node.d.mts.map