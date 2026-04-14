declare function wrapSafe<T>(task: () => T): T | undefined;

export { wrapSafe };
