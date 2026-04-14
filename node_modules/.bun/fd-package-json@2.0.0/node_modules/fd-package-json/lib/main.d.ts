/**
 * Finds the path of the first `package.json` encountered when traversing
 * the file system upwards from the specified `cwd`.
 * @param {string} cwd Current/starting directory
 * @return {Promise<string|null>}
 */
export declare function findPackagePath(cwd: string): Promise<string | null>;
export type Package = Record<string, unknown>;
/**
 * Finds and returns the contents of the first `package.json` encountered
 * when traversing the file system upwards from the specified `cwd`.
 * @param {string} cwd Current/starting directory
 * @return {Promise<Package | null>}
 */
export declare function findPackage(cwd: string): Promise<Package | null>;
/**
 * Synchronously Finds the path of the first `package.json` encountered when
 * traversing the file system upwards from the specified `cwd`.
 * @param {string} cwd Current/starting directory
 * @return {string|null}
 */
export declare function findPackagePathSync(cwd: string): string | null;
/**
 * Synchronously finds and returns the contents of the first `package.json`
 * encountered when traversing the file system upwards from the specified `cwd`.
 * @param {string} cwd Current/starting directory
 * @return {Package | null}
 */
export declare function findPackageSync(cwd: string): Package | null;
