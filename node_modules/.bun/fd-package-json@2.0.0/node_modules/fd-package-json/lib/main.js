import { walkUp } from 'walk-up-path';
import { resolve } from 'node:path';
import { stat, readFile } from 'node:fs/promises';
import { statSync, readFileSync } from 'node:fs';
/**
 * Determines if a file exists or not
 * @param {string} path Path of the file
 * @return {Promise<boolean>}
 */
async function fileExists(path) {
    try {
        const stats = await stat(path);
        return stats.isFile();
    }
    catch (_err) {
        return false;
    }
}
/**
 * Synchronously determines if a file exists or not
 * @param {string} path Path of the file
 * @return {boolean}
 */
function fileExistsSync(path) {
    try {
        const stats = statSync(path);
        return stats.isFile();
    }
    catch (_err) {
        return false;
    }
}
/**
 * Finds the path of the first `package.json` encountered when traversing
 * the file system upwards from the specified `cwd`.
 * @param {string} cwd Current/starting directory
 * @return {Promise<string|null>}
 */
export async function findPackagePath(cwd) {
    for (const path of walkUp(cwd)) {
        const packagePath = resolve(path, 'package.json');
        const hasPackageJson = await fileExists(packagePath);
        if (hasPackageJson) {
            return packagePath;
        }
    }
    return null;
}
/**
 * Finds and returns the contents of the first `package.json` encountered
 * when traversing the file system upwards from the specified `cwd`.
 * @param {string} cwd Current/starting directory
 * @return {Promise<Package | null>}
 */
export async function findPackage(cwd) {
    const packagePath = await findPackagePath(cwd);
    if (!packagePath) {
        return null;
    }
    try {
        const source = await readFile(packagePath, { encoding: 'utf8' });
        return JSON.parse(source);
    }
    catch (_err) {
        return null;
    }
}
/**
 * Synchronously Finds the path of the first `package.json` encountered when
 * traversing the file system upwards from the specified `cwd`.
 * @param {string} cwd Current/starting directory
 * @return {string|null}
 */
export function findPackagePathSync(cwd) {
    for (const path of walkUp(cwd)) {
        const packagePath = resolve(path, 'package.json');
        const hasPackageJson = fileExistsSync(packagePath);
        if (hasPackageJson) {
            return packagePath;
        }
    }
    return null;
}
/**
 * Synchronously finds and returns the contents of the first `package.json`
 * encountered when traversing the file system upwards from the specified `cwd`.
 * @param {string} cwd Current/starting directory
 * @return {Package | null}
 */
export function findPackageSync(cwd) {
    const packagePath = findPackagePathSync(cwd);
    if (!packagePath) {
        return null;
    }
    try {
        const source = readFileSync(packagePath, { encoding: 'utf8' });
        return JSON.parse(source);
    }
    catch (_err) {
        return null;
    }
}
