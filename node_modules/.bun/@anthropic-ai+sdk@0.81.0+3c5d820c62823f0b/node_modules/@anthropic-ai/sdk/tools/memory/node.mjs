export { betaMemoryTool } from "../../helpers/beta/memory.mjs";
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
async function exists(path) {
    return await fs
        .access(path)
        .then(() => true)
        .catch((err) => {
        if (err.code === 'ENOENT')
            return false;
        throw err;
    });
}
/**
 * Atomically writes content to a file by writing to a temporary file first and then renaming it.
 * This ensures the target file is never in a partially written state, preventing data corruption
 * if the process crashes or is interrupted during the write operation. The rename operation is
 * atomic on most file systems, guaranteeing that readers will only ever see the complete old
 * content or the complete new content, never a mix or partial state.
 *
 * @param targetPath - The path where the file should be written
 * @param content - The content to write to the file
 */
async function atomicWriteFile(targetPath, content) {
    const dir = path.dirname(targetPath);
    const tempPath = path.join(dir, `.tmp-${process.pid}-${randomUUID()}`);
    let handle;
    try {
        handle = await fs.open(tempPath, 'wx');
        await handle.writeFile(content, 'utf-8');
        await handle.sync();
        await handle.close();
        handle = undefined;
        await fs.rename(tempPath, targetPath);
    }
    catch (err) {
        if (handle) {
            await handle.close().catch(() => { });
        }
        await fs.unlink(tempPath).catch(() => { });
        throw err;
    }
}
/**
 * Validates that a target path doesn't escape the memory root via symlinks.
 *
 * Prevents symlink attacks where a malicious symlink inside /memories points
 * outside (e.g., /memories/foo -> /etc), which would allow operations like
 * creating /memories/foo/passwd to actually write to /etc/passwd.
 *
 * Walks up from the target path to find the deepest existing ancestor,
 * then resolves it to ensure the real path stays within memoryRoot.
 */
async function validateNoSymlinkEscape(targetPath, memoryRoot) {
    const resolvedRoot = await fs.realpath(memoryRoot);
    let current = targetPath;
    while (true) {
        try {
            const resolved = await fs.realpath(current);
            if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
                throw new Error(`Path would escape /memories directory via symlink`);
            }
            return;
        }
        catch (err) {
            if (err.code !== 'ENOENT')
                throw err;
            const parent = path.dirname(current);
            if (parent === current || current === memoryRoot) {
                return;
            }
            current = parent;
        }
    }
}
async function readFileContent(fullPath, memoryPath) {
    try {
        return await fs.readFile(fullPath, 'utf-8');
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`The file ${memoryPath} no longer exists (may have been deleted or renamed concurrently).`);
        }
        throw err;
    }
}
function formatFileSize(bytes) {
    if (bytes === 0)
        return '0B';
    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);
    return (size % 1 === 0 ? size.toString() : size.toFixed(1)) + sizes[i];
}
const MAX_LINES = 999999;
const LINE_NUMBER_WIDTH = String(MAX_LINES).length;
export class BetaLocalFilesystemMemoryTool {
    constructor(basePath = './memory') {
        this.basePath = basePath;
        this.memoryRoot = path.join(this.basePath, 'memories');
    }
    static async init(basePath = './memory') {
        const memory = new BetaLocalFilesystemMemoryTool(basePath);
        await fs.mkdir(memory.memoryRoot, { recursive: true });
        return memory;
    }
    async validatePath(memoryPath) {
        if (!memoryPath.startsWith('/memories')) {
            throw new Error(`Path must start with /memories, got: ${memoryPath}`);
        }
        const relativePath = memoryPath.slice('/memories'.length).replace(/^\//, '');
        const fullPath = relativePath ? path.join(this.memoryRoot, relativePath) : this.memoryRoot;
        const resolvedPath = path.resolve(fullPath);
        const resolvedRoot = path.resolve(this.memoryRoot);
        if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) {
            throw new Error(`Path ${memoryPath} would escape /memories directory`);
        }
        await validateNoSymlinkEscape(resolvedPath, this.memoryRoot);
        return resolvedPath;
    }
    async view(command) {
        const fullPath = await this.validatePath(command.path);
        let stat;
        try {
            stat = await fs.stat(fullPath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`The path ${command.path} does not exist. Please provide a valid path.`);
            }
            throw err;
        }
        if (stat.isDirectory()) {
            const items = [];
            const collectItems = async (dirPath, relativePath, depth) => {
                if (depth > 2)
                    return;
                const dirContents = await fs.readdir(dirPath);
                for (const item of dirContents.sort()) {
                    if (item.startsWith('.') || item === 'node_modules') {
                        continue;
                    }
                    const itemPath = path.join(dirPath, item);
                    const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
                    let itemStat;
                    try {
                        itemStat = await fs.stat(itemPath);
                    }
                    catch {
                        continue;
                    }
                    if (itemStat.isDirectory()) {
                        items.push({ size: formatFileSize(itemStat.size), path: `${itemRelativePath}/` });
                        if (depth < 2) {
                            await collectItems(itemPath, itemRelativePath, depth + 1);
                        }
                    }
                    else if (itemStat.isFile()) {
                        items.push({ size: formatFileSize(itemStat.size), path: itemRelativePath });
                    }
                }
            };
            await collectItems(fullPath, '', 1);
            const header = `Here're the files and directories up to 2 levels deep in ${command.path}, excluding hidden items and node_modules:`;
            const dirSize = formatFileSize(stat.size);
            const lines = [
                `${dirSize}\t${command.path}`,
                ...items.map((item) => `${item.size}\t${command.path}/${item.path}`),
            ];
            return `${header}\n${lines.join('\n')}`;
        }
        else if (stat.isFile()) {
            const content = await readFileContent(fullPath, command.path);
            const lines = content.split('\n');
            if (lines.length > MAX_LINES) {
                throw new Error(`File ${command.path} has too many lines (${lines.length}). Maximum is ${MAX_LINES.toLocaleString()} lines.`);
            }
            let displayLines = lines;
            let startNum = 1;
            if (command.view_range && command.view_range.length === 2) {
                const startLine = Math.max(1, command.view_range[0]) - 1;
                const endLine = command.view_range[1] === -1 ? lines.length : command.view_range[1];
                displayLines = lines.slice(startLine, endLine);
                startNum = startLine + 1;
            }
            const numberedLines = displayLines.map((line, i) => `${String(i + startNum).padStart(LINE_NUMBER_WIDTH, ' ')}\t${line}`);
            return `Here's the content of ${command.path} with line numbers:\n${numberedLines.join('\n')}`;
        }
        else {
            throw new Error(`Unsupported file type for ${command.path}`);
        }
    }
    async create(command) {
        const fullPath = await this.validatePath(command.path);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        let handle;
        try {
            handle = await fs.open(fullPath, 'wx');
            await handle.writeFile(command.file_text, 'utf-8');
            await handle.sync();
        }
        catch (err) {
            if (err?.code === 'EEXIST') {
                throw new Error(`File ${command.path} already exists`);
            }
            throw err;
        }
        finally {
            await handle?.close().catch(() => { });
        }
        return `File created successfully at: ${command.path}`;
    }
    async str_replace(command) {
        const fullPath = await this.validatePath(command.path);
        let stat;
        try {
            stat = await fs.stat(fullPath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`The path ${command.path} does not exist. Please provide a valid path.`);
            }
            throw err;
        }
        if (!stat.isFile()) {
            throw new Error(`The path ${command.path} is not a file.`);
        }
        const content = await readFileContent(fullPath, command.path);
        const lines = content.split('\n');
        const matchingLines = [];
        lines.forEach((line, index) => {
            if (line.includes(command.old_str)) {
                matchingLines.push(index + 1);
            }
        });
        if (matchingLines.length === 0) {
            throw new Error(`No replacement was performed, old_str \`${command.old_str}\` did not appear verbatim in ${command.path}.`);
        }
        else if (matchingLines.length > 1) {
            throw new Error(`No replacement was performed. Multiple occurrences of old_str \`${command.old_str}\` in lines: ${matchingLines.join(', ')}. Please ensure it is unique`);
        }
        const newContent = content.replace(command.old_str, command.new_str);
        await atomicWriteFile(fullPath, newContent);
        const newLines = newContent.split('\n');
        const changedLineIndex = matchingLines[0] - 1;
        const contextStart = Math.max(0, changedLineIndex - 2);
        const contextEnd = Math.min(newLines.length, changedLineIndex + 3);
        const snippet = newLines.slice(contextStart, contextEnd).map((line, i) => {
            const lineNum = contextStart + i + 1;
            return `${String(lineNum).padStart(LINE_NUMBER_WIDTH, ' ')}\t${line}`;
        });
        return `The memory file has been edited. Here is the snippet showing the change (with line numbers):\n${snippet.join('\n')}`;
    }
    async insert(command) {
        const fullPath = await this.validatePath(command.path);
        let stat;
        try {
            stat = await fs.stat(fullPath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`The path ${command.path} does not exist. Please provide a valid path.`);
            }
            throw err;
        }
        if (!stat.isFile()) {
            throw new Error(`The path ${command.path} is not a file.`);
        }
        const content = await readFileContent(fullPath, command.path);
        const lines = content.split('\n');
        if (command.insert_line < 0 || command.insert_line > lines.length) {
            throw new Error(`Invalid \`insert_line\` parameter: ${command.insert_line}. It should be within the range of lines of the file: [0, ${lines.length}]`);
        }
        lines.splice(command.insert_line, 0, command.insert_text.replace(/\n$/, ''));
        await atomicWriteFile(fullPath, lines.join('\n'));
        return `The file ${command.path} has been edited.`;
    }
    async delete(command) {
        const fullPath = await this.validatePath(command.path);
        if (command.path === '/memories') {
            throw new Error('Cannot delete the /memories directory itself');
        }
        try {
            await fs.rm(fullPath, { recursive: true, force: false });
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`The path ${command.path} does not exist`);
            }
            throw err;
        }
        return `Successfully deleted ${command.path}`;
    }
    async rename(command) {
        const oldFullPath = await this.validatePath(command.old_path);
        const newFullPath = await this.validatePath(command.new_path);
        // POSIX rename() silently overwrites existing files without error,
        // so we can't catch this atomically. Best-effort check to warn user.
        if (await exists(newFullPath)) {
            throw new Error(`The destination ${command.new_path} already exists`);
        }
        const newDir = path.dirname(newFullPath);
        await fs.mkdir(newDir, { recursive: true });
        try {
            await fs.rename(oldFullPath, newFullPath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`The path ${command.old_path} does not exist`);
            }
            throw err;
        }
        return `Successfully renamed ${command.old_path} to ${command.new_path}`;
    }
}
//# sourceMappingURL=node.mjs.map